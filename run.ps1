$ErrorActionPreference = 'Continue'
$target = 'F:\backtest\comic-engine'
$py = Join-Path $target '.venv\Scripts\python.exe'
$logDir = Join-Path $target 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Set-Location -LiteralPath $target
$env:PYTHONIOENCODING = 'utf-8'
$outLog = Join-Path $logDir 'app.task.out.log'
$errLog = Join-Path $logDir 'app.task.err.log'

while ($true) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $outLog -Value "`n=== Server (re)started at $timestamp ==="
    & $py -u app.py 1>> $outLog 2>> $errLog
    $exitCode = $LASTEXITCODE
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $outLog -Value "=== Server exited (code $exitCode) at $timestamp. Restarting in 5s... ==="
    Start-Sleep -Seconds 5
}
