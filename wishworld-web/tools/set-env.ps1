# Copies the server-side secrets this project needs onto Vercel (production), without printing any value.
# Sources: wishworld-web/.env.local (DATABASE_URL, FAL_KEY if present) and the Unity project's ../.env
# (ANTHROPIC_*, ELEVENLABS_*). Run from PowerShell:  pwsh -File tools/set-env.ps1
$root = Split-Path -Parent $PSScriptRoot
function Read-EnvFile([string]$path) {
  $map = @{}
  if (Test-Path $path) {
    foreach ($line in Get-Content $path) {
      $t = $line.Trim()
      if (-not $t -or $t.StartsWith('#')) { continue }
      $i = $t.IndexOf('=')
      if ($i -lt 1) { continue }
      $map[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
    }
  }
  return $map
}
$local = Read-EnvFile (Join-Path $root '.env.local')
$unity = Read-EnvFile (Join-Path (Split-Path -Parent $root) '.env')

# The Unity project can hold two ElevenLabs accounts; ELEVENLABS_ACCOUNT=2 selects the "...2" values.
$suffix = if ($unity['ELEVENLABS_ACCOUNT'] -eq '2') { '2' } else { '' }
$wanted = [ordered]@{
  DATABASE_URL              = $local['DATABASE_URL']
  FAL_KEY                   = $local['FAL_KEY']
  ANTHROPIC_API_KEY         = $unity['ANTHROPIC_API_KEY']
  ANTHROPIC_MODEL           = $unity['ANTHROPIC_MODEL']
  ELEVENLABS_API_KEY        = $unity["ELEVENLABS_API_KEY$suffix"]
  ELEVENLABS_VOICE_ID       = $unity['ELEVENLABS_VOICE_ID']
  ELEVENLABS_AGENT_ID       = $unity["ELEVENLABS_AGENT_ID$suffix"]
  ELEVENLABS_GUIDE_AGENT_ID = $unity["ELEVENLABS_GUIDE_AGENT_ID$suffix"]
}
Set-Location $root
foreach ($name in $wanted.Keys) {
  $value = $wanted[$name]
  if ([string]::IsNullOrWhiteSpace($value)) { "{0,-28} skipped (no value found)" -f $name; continue }
  $out = & vercel env add $name production --value $value --yes --force --no-color 2>&1 | Out-String
  $ok = $LASTEXITCODE -eq 0
  "{0,-28} {1}" -f $name, $(if ($ok) { 'set' } else { 'FAILED: ' + (($out -replace [regex]::Escape($value), '<value>') -split "`n" | Where-Object { $_ -match 'Error' } | Select-Object -First 1) })
}
