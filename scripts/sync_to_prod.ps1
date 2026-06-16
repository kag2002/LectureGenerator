# scripts/sync_to_prod.ps1
# PowerShell script to synchronize code from Development to Production instance.
# Excludes environment variables, databases, caches, and dependency modules.

$DevDir = "C:\Users\Admin\Documents\VinUni\CodeLab\C2-App-023"
$ProdDir = "C:\Users\Admin\Documents\VinUni\CodeLab\C2-App-023-prod"

if (-not (Test-Path $ProdDir)) {
    Write-Host "Creating Production Directory: $ProdDir" -ForegroundColor Green
    New-Item -ItemType Directory -Force -Path $ProdDir
}

# Source items to copy
$SourceItems = @("src", "frontend", "requirements.txt", "package.json", "README.md", "ruff.toml")

foreach ($item in $SourceItems) {
    $srcPath = Join-Path $DevDir $item
    $destPath = Join-Path $ProdDir $item
    
    if (Test-Path $srcPath) {
        Write-Host "Syncing: $item ..." -ForegroundColor Cyan
        if (Test-Path $srcPath -PathType Container) {
            # Copy Directory excluding specific folders/files
            Robocopy $srcPath $destPath /MIR /XD "node_modules" ".next" "out" ".venv" ".pytest_cache" ".ruff_cache" "data" ".llm_cache" /XF "*.db" "*.db-wal" "*.db-shm" ".env" "*.log" | Out-Null
        } else {
            # Copy single file
            Copy-Item -Path $srcPath -Destination $destPath -Force
        }
    }
}

Write-Host "Sync Completed Successfully!" -ForegroundColor Green
Write-Host "To restart the Production FastAPI server, run this in the Prod directory:" -ForegroundColor Yellow
Write-Host "  Stop the current production process, then run:" -ForegroundColor Yellow
Write-Host "  uvicorn src.main:app --host 0.0.0.0 --port 8000 --workers 4" -ForegroundColor Yellow
