# AI-QMS 8D Commander - PowerShell Launcher
$path = Join-Path $PSScriptRoot 'index.html'
Start-Process $path
Write-Host '[OK] AI 8D Portal launched in default browser.' -ForegroundColor Green
