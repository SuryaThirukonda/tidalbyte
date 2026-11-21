# Deploys this folder to Netlify production (project "wishworld-web") and prints the result lines.
# Usage (PowerShell):  pwsh -File tools/deploy-netlify.ps1
# Needs the Netlify CLI (npm i -g netlify-cli), `netlify login` once, and `netlify link --name wishworld-web`
# once in this folder, all from PowerShell (a login made from Git Bash may not be seen here, and the reverse).
# Environment variables live on Netlify (netlify env:list), never in netlify.toml.
$web = Split-Path -Parent $PSScriptRoot
Push-Location $web
try {
  # The functions run on Linux: put sharp's Linux build in node_modules (the Windows one is restored below).
  $sharp = (Get-Content 'node_modules/sharp/package.json' -Raw | ConvertFrom-Json).optionalDependencies
  $pkgs = @(
    "@img/sharp-linux-x64@$($sharp.'@img/sharp-linux-x64')",
    "@img/sharp-libvips-linux-x64@$($sharp.'@img/sharp-libvips-linux-x64')"
  )
  npm install --no-save --force --os=linux --cpu=x64 --libc=glibc @pkgs | Out-Null
  $lines = netlify deploy --prod --skip-functions-cache --message "deploy-netlify.ps1" 2>&1
  $lines | Where-Object { $_ -match 'Error|error|Production URL|Deploy is live|Unique deploy URL' } |
    ForEach-Object { "$_".Trim() } | Select-Object -First 12
  # Put the Windows build of sharp back for local use.
  npm install | Out-Null
}
finally {
  Pop-Location
}
"Site: https://wishworld-web.netlify.app"
