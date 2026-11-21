# Deploys this folder to Vercel production and prints the result lines.
# Usage (PowerShell only; the CLI login is not visible from Git Bash):  pwsh -File tools/deploy.ps1
$lines = & (Join-Path $PSScriptRoot 'vc.ps1') -Timeout 420 deploy --prod --yes --scope suryathirukondas-projects
$lines | Where-Object { $_ -match 'Error|error:|Aliased|readyState|TIMED OUT|"message"' } |
  ForEach-Object { $_.Trim() } | Select-Object -First 12
"Site: https://wishworld-web.vercel.app"
