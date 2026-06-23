# =====================================================================
#   AI Lecture Assistant - Tunnel Launcher (Cloudflare Quick Tunnel)
#   Chạy: .\tunnel-start.ps1
#   Mục đích: Host app 24/7 với link public ngẫu nhiên trycloudflare.com
# =====================================================================

Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host "   AI Lecture Assistant - Cloudflare Tunnel Launcher" -ForegroundColor Cyan
Write-Host "=============================================================" -ForegroundColor Cyan
# Clear existing processes on ports 8000 (Backend) and 3000 (Frontend) to prevent conflicts
foreach ($port in @(8000, 3000)) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
    if ($conn) {
        $procId = $conn.OwningProcess[0]
        try {
            $procName = (Get-Process -Id $procId).ProcessName
            Write-Host "[CLEANUP] Stopping existing process $procName (PID $procId) on port $port..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        } catch {
            # Silent fallback
        }
    }
}
Write-Host ""

# ---- Kiểm tra cloudflared ----
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] 'cloudflared' not found. Installing..." -ForegroundColor Red
    winget install --id Cloudflare.cloudflared -e --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install cloudflared. Please install manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" -ForegroundColor Red
        exit 1
    }
}

# ---- 1. Start Backend (FastAPI port 8000) ----
Write-Host "[BACKEND] Starting FastAPI backend (port 8000)..." -ForegroundColor Green
$backendJob = $null
if (Test-Path ".venv\Scripts\python.exe") {
    $backendCmd = "Write-Host 'Backend starting...' -ForegroundColor Green; .\.venv\Scripts\Activate.ps1; uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload"
    $backendJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WindowStyle Normal -PassThru
} else {
    $backendCmd = "uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload"
    $backendJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WindowStyle Normal -PassThru
}

Write-Host "[BACKEND] Waiting for backend to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# ---- 2. Tạo tunnel cho Backend (port 8000) để lấy API URL ----
Write-Host "[TUNNEL-API] Creating Cloudflare Quick Tunnel for Backend..." -ForegroundColor Magenta

# File tạm để capture output từ cloudflared
$apiTunnelLog = "$env:TEMP\cf_tunnel_api.log"
$apiFrontendLog = "$env:TEMP\cf_tunnel_frontend.log"

# Chạy cloudflared tunnel cho backend, ghi log ra file
$apiTunnelProc = Start-Process cloudflared `
    -ArgumentList "tunnel", "--url", "http://localhost:8000", "--no-autoupdate", "--logfile", $apiTunnelLog `
    -PassThru -WindowStyle Minimized

Write-Host "[TUNNEL-API] Waiting for backend tunnel URL..." -ForegroundColor Yellow
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
    Write-Host "[SUCCESS] [TUNNEL-API] Backend tunnel URL: $apiTunnelUrl" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Could not retrieve backend tunnel URL from log. Using localhost fallback." -ForegroundColor Yellow
    $apiTunnelUrl = "http://localhost:8000"
}

# ---- 3. Set NEXT_PUBLIC_API_URL và start Frontend ----
Write-Host ""
Write-Host "[FRONTEND] Starting Next.js frontend with API URL = $apiTunnelUrl" -ForegroundColor Green

$frontendCmd = "Set-Location '$PSScriptRoot\frontend'; `$env:NEXT_PUBLIC_API_URL='$apiTunnelUrl'; `$env:NEXT_PUBLIC_API_BASE_URL='$apiTunnelUrl'; Write-Host 'Frontend starting with API=$apiTunnelUrl' -ForegroundColor Cyan; npm run dev"
$frontendJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd -WindowStyle Normal -PassThru

Write-Host "[FRONTEND] Waiting for Next.js frontend to start (port 3000)..." -ForegroundColor Yellow
Start-Sleep -Seconds 12

# ---- 4. Tạo tunnel cho Frontend (port 3000) ----
Write-Host ""
Write-Host "[TUNNEL-UI] Creating Cloudflare Quick Tunnel for Frontend (port 3000)..." -ForegroundColor Magenta

$frontendTunnelProc = Start-Process cloudflared `
    -ArgumentList "tunnel", "--url", "http://localhost:3000", "--no-autoupdate", "--logfile", $apiFrontendLog `
    -PassThru -WindowStyle Minimized

Write-Host "[TUNNEL-UI] Waiting for frontend tunnel URL..." -ForegroundColor Yellow
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
Write-Host "  [RUNNING] APP IS RUNNING AND ACCESSIBLE FROM INTERNET!" -ForegroundColor Green
Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host ""
if ($frontendTunnelUrl) {
    Write-Host "  [LINK] ACCESS LINK (share this link): $frontendTunnelUrl" -ForegroundColor Yellow
} else {
    Write-Host "  [LINK] Frontend tunnel is starting. Check log: $apiFrontendLog" -ForegroundColor Yellow
}
Write-Host "  [API] API Backend tunnel:  $apiTunnelUrl" -ForegroundColor Cyan
Write-Host "  [LOCAL] Local Frontend:      http://localhost:3000" -ForegroundColor Cyan
Write-Host "  [LOCAL] Local Backend:       http://localhost:8000" -ForegroundColor Cyan
Write-Host ""
Write-Host "  [WARNING] Keep this window OPEN to maintain tunnel connection." -ForegroundColor Red
Write-Host "  [WARNING] Link will change each time script restarts." -ForegroundColor Red
Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Enter to exit launcher (tunnels and servers will keep running)..." -ForegroundColor Gray
Read-Host
