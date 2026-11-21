# Runs the Vercel CLI from this project folder with a time limit, so a hidden prompt cannot hang the caller.
# Usage:  pwsh -File tools/vc.ps1 -Timeout 180 deploy --prod --yes
# The Vercel CLI login on this machine is only visible from PowerShell (not from Git Bash).
param(
  [int]$Timeout = 120,
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$VercelArgs
)
$root = Split-Path -Parent $PSScriptRoot
$job = Start-Job -ScriptBlock {
  param($cwd, $argList)
  Set-Location $cwd
  & vercel @argList --no-color 2>&1 | Out-String
} -ArgumentList $root, $VercelArgs
if (Wait-Job $job -Timeout $Timeout) {
  $out = Receive-Job $job
} else {
  Stop-Job $job
  $out = "TIMED OUT after $Timeout s`n" + (Receive-Job $job | Out-String)
}
Remove-Job $job -Force
# Never echo e-mail addresses back.
($out -replace '[\w\.\-\+]+@[\w\.\-]+', '<email>') -split "`n" |
  Where-Object { $_.Trim() -and $_ -notmatch 'claude-code-hint' } |
  ForEach-Object { $_.TrimEnd() }
