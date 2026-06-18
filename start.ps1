# AI20K Project Development Launcher (PowerShell on Windows)
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "             AI20K Project Development Launcher (Windows)" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# Check for .env file in root
if (-not (Test-Path ".env")) {
    Write-Host "[WARNING] File .env not found in the root directory." -ForegroundColor Yellow
    Write-Host "[WARNING] Copying .env.example to .env ..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "[WARNING] Please open .env and add your API keys." -ForegroundColor Yellow
    Write-Host ""
}

# Start Backend (FastAPI) in a new window
Write-Host "[BACKEND] Starting FastAPI Backend in a new window..." -ForegroundColor Green
if (Test-Path ".venv\Scripts\Activate.ps1") {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Activating virtual environment...'; .\.venv\Scripts\Activate.ps1; uvicorn src.main:app --reload --port 8000" -WindowStyle Normal
} else {
    Write-Host "[BACKEND] Virtual env not found. Starting with system uvicorn..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "uvicorn src.main:app --reload --port 8000" -WindowStyle Normal
}

# Start Frontend (Next.js) in a new window
Write-Host "[FRONTEND] Starting Next.js Frontend in a new window..." -ForegroundColor Green
if (Test-Path "frontend\node_modules") {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location frontend; npm run dev" -WindowStyle Normal
} else {
    Write-Host "[FRONTEND] node_modules not found. Running npm install first..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location frontend; npm install; npm run dev" -WindowStyle Normal
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "[SUCCESS] Both Backend and Frontend have been launched!" -ForegroundColor Cyan
Write-Host ""
Write-Host " - FastAPI Backend is running at: http://localhost:8000"
Write-Host " - FastAPI Docs (Swagger):      http://localhost:8000/docs"
Write-Host " - Next.js Frontend is running at: http://localhost:3000"
Write-Host ""
Write-Host "You can close the spawned console windows to stop the servers."
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""
Read-Host -Prompt "Press Enter to exit this launcher script"
