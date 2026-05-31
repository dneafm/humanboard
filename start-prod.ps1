param(
    [Alias('Host')]
    [string]$ListenHost = '0.0.0.0',
    [int]$Port = 3001
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$distIndex = Join-Path $root 'dist\index.html'
if (-not (Test-Path $distIndex)) {
    throw "HumanBoard production build missing: $distIndex. Run 'npm.cmd run build:prod' first."
}

$node = Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $node) {
    throw 'Unable to locate node.exe on PATH.'
}

$env:HUMANBOARD_HOST = $ListenHost
$env:HUMANBOARD_PORT = [string]$Port

Write-Host "Starting HumanBoard production server on http://$ListenHost`:$Port"
Write-Host "Command: $($node.Source) $root\server.mjs"
& $node.Source (Join-Path $root 'server.mjs')
exit $LASTEXITCODE
