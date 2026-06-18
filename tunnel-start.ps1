# =====================================================================
#   AI Lecture Assistant - Tunnel Launcher (Cloudflare Quick Tunnel)
#   Chạy: .\tunnel-start.ps1
#   Mục đích: Host app 24/7 với link public ngẫu nhiên trycloudflare.com
# =====================================================================

Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host "   AI Lecture Assistant - Cloudflare Tunnel Launcher" -ForegroundColor Cyan
Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host ""

# ---- Kiểm tra cloudflared ----
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] 'cloudflared' chưa được cài. Đang cài..." -ForegroundColor Red
    winget install --id Cloudflare.cloudflared -e --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Không cài được cloudflared. Hãy cài thủ công: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" -ForegroundColor Red
        exit 1
    }
}

# ---- 1. Start Backend (FastAPI port 8000) ----
Write-Host "[BACKEND] Khởi động FastAPI backend (port 8000)..." -ForegroundColor Green
$backendJob = $null
if (Test-Path ".venv\Scripts\python.exe") {
    $backendJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", `
        "Write-Host 'Backend starting...' -ForegroundColor Green; " + `
        ".\.venv\Scripts\Activate.ps1; " + `
        "uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload" `
        -WindowStyle Normal -PassThru
} else {
    $backendJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", `
        "uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload" `
        -WindowStyle Normal -PassThru
}

Write-Host "[BACKEND] Đang chờ backend khởi động..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# ---- 2. Tạo tunnel cho Backend (port 8000) để lấy API URL ----
Write-Host "[TUNNEL-API] Tạo Cloudflare Quick Tunnel cho Backend..." -ForegroundColor Magenta

# File tạm để capture output từ cloudflared
$apiTunnelLog = "$env:TEMP\cf_tunnel_api.log"
$apiFrontendLog = "$env:TEMP\cf_tunnel_frontend.log"

# Chạy cloudflared tunnel cho backend, ghi log ra file
$apiTunnelProc = Start-Process cloudflared `
    -ArgumentList "tunnel", "--url", "http://localhost:8000", "--no-autoupdate", "--logfile", $apiTunnelLog `
    -PassThru -WindowStyle Minimized

Write-Host "[TUNNEL-API] Đang chờ lấy URL tunnel backend..." -ForegroundColor Yellow
$apiTunnelUrl = $null
$maxWait = 30
$waited = 0
while (-not $apiTunnelUrl -and $waited -lt $maxWait) {
    Start-Sleep -Seconds 2
    $waited += 2
    if (Test-Path $apiTunnelLog) {
        $logContent = Get-Content $apiTunnelLog -Raw -ErrorAction SilentlyContinue
        if ($logContent -match "https://[a-z0-9\-]+\.trycloudflare\.com") {
            $apiTunnelUrl = $Matches[0]
        }
    }
    # Also try stderr approach
    if (-not $apiTunnelUrl) {
        $procOutput = & cloudflared tunnel --url http://localhost:8000 --no-autoupdate 2>&1 | Select-String "trycloudflare.com" -SimpleMatch | Select-Object -First 1
    }
}

# Fallback: scan log file with broader pattern
if (-not $apiTunnelUrl -and (Test-Path $apiTunnelLog)) {
    $lines = Get-Content $apiTunnelLog
    foreach ($line in $lines) {
        if ($line -match "(https://[a-zA-Z0-9\-]+\.trycloudflare\.com)") {
            $apiTunnelUrl = $Matches[1]
            break
        }
    }
}

if ($apiTunnelUrl) {
    Write-Host ""
    Write-Host "✅ [TUNNEL-API] Backend tunnel URL: $apiTunnelUrl" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Không lấy được backend tunnel URL từ log. Dùng localhost fallback." -ForegroundColor Yellow
    $apiTunnelUrl = "http://localhost:8000"
}

# ---- 3. Set NEXT_PUBLIC_API_URL và start Frontend ----
Write-Host ""
Write-Host "[FRONTEND] Khởi động Next.js frontend với API URL = $apiTunnelUrl" -ForegroundColor Green

$frontendJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "Set-Location '$PSScriptRoot\frontend'; " + `
    "`$env:NEXT_PUBLIC_API_URL='$apiTunnelUrl'; " + `
    "`$env:NEXT_PUBLIC_API_BASE_URL='$apiTunnelUrl'; " + `
    "Write-Host 'Frontend starting with API=$apiTunnelUrl' -ForegroundColor Cyan; " + `
    "npm run dev" `
    -WindowStyle Normal -PassThru

Write-Host "[FRONTEND] Đang chờ Next.js frontend khởi động (port 3000)..." -ForegroundColor Yellow
Start-Sleep -Seconds 12

# ---- 4. Tạo tunnel cho Frontend (port 3000) ----
Write-Host ""
Write-Host "[TUNNEL-UI] Tạo Cloudflare Quick Tunnel cho Frontend (port 3000)..." -ForegroundColor Magenta

$frontendTunnelProc = Start-Process cloudflared `
    -ArgumentList "tunnel", "--url", "http://localhost:3000", "--no-autoupdate", "--logfile", $apiFrontendLog `
    -PassThru -WindowStyle Minimized

Write-Host "[TUNNEL-UI] Đang chờ lấy URL tunnel frontend..." -ForegroundColor Yellow
$frontendTunnelUrl = $null
$waited = 0
while (-not $frontendTunnelUrl -and $waited -lt 30) {
    Start-Sleep -Seconds 2
    $waited += 2
    if (Test-Path $apiFrontendLog) {
        $logContent = Get-Content $apiFrontendLog -Raw -ErrorAction SilentlyContinue
        if ($logContent -match "(https://[a-zA-Z0-9\-]+\.trycloudflare\.com)") {
            $frontendTunnelUrl = $Matches[1]
        }
    }
}

Write-Host ""
Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host "  🚀 APP ĐANG CHẠY VÀ CÓ THỂ TRUY CẬP TỪ INTERNET!" -ForegroundColor Green
Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host ""
if ($frontendTunnelUrl) {
    Write-Host "  🌐 LINK TRUY CẬP (share link này): $frontendTunnelUrl" -ForegroundColor Yellow
} else {
    Write-Host "  🌐 Frontend tunnel đang khởi động. Kiểm tra file: $apiFrontendLog" -ForegroundColor Yellow
}
Write-Host "  🔧 API Backend tunnel:  $apiTunnelUrl" -ForegroundColor Cyan
Write-Host "  💻 Local Frontend:      http://localhost:3000" -ForegroundColor Cyan
Write-Host "  💻 Local Backend:       http://localhost:8000" -ForegroundColor Cyan
Write-Host ""
Write-Host "  ⚠️  Giữ cửa sổ này MỞ để duy trì kết nối tunnel." -ForegroundColor Red
Write-Host "  ⚠️  Link sẽ thay đổi mỗi lần restart script." -ForegroundColor Red
Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Nhấn Enter để thoát launcher (các tunnel & server vẫn chạy)..." -ForegroundColor Gray
Read-Host
