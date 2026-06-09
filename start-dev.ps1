$stdout = 'F:\backtest\humanboard\vite.log'
$stderr = 'F:\backtest\humanboard\vite.err.log'
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory 'F:\backtest\humanboard' -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden
