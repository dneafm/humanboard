Get-NetTCPConnection | Where-Object { $_.LocalPort -eq 4173 -or $_.LocalPort -eq 8878 } | Format-Table -Wrap
