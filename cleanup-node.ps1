Write-Host "Stopping PM2-DJTrade-Bootstrap scheduled task..."
Stop-ScheduledTask -TaskName "PM2-DJTrade-Bootstrap" -ErrorAction SilentlyContinue

Write-Host "Killing all duplicate node processes..."
$targets = Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -eq "node.exe" -or $_.Name -eq "node") -and (
        $_.CommandLine -like "*djtrade-v3-pm2-wrapper.cjs*" -or
        $_.CommandLine -like "*server.ts*" -or
        $_.CommandLine -like "*pm2-runtime*" -or
        $_.CommandLine -like "*ecosystem.djtrade.config.cjs*"
    )
}

foreach ($target in $targets) {
    Write-Host "Killing PID $($target.ProcessId): $($target.CommandLine)"
    Stop-Process -Id $target.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host "Waiting 5 seconds..."
Start-Sleep -Seconds 5

Write-Host "Starting PM2-DJTrade-Bootstrap scheduled task..."
Start-ScheduledTask -TaskName "PM2-DJTrade-Bootstrap"

Write-Host "Cleanup completed successfully!"
