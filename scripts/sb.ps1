# Runs the Supabase CLI without requiring a global install.
#
# Why this exists: the machine's Application Control policy blocks the
# npm-installed CLI binary, but the official GitHub-release binary runs fine.
# So we keep it repo-local under tools/ (gitignored) and download it on first
# use — which also means a fresh machine needs nothing but this script.
#
#   ./scripts/sb.ps1 link --project-ref <ref>
#   ./scripts/sb.ps1 migration list
#   ./scripts/sb.ps1 db push
#
# Authentication travels via SUPABASE_ACCESS_TOKEN (never baked into files).

param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CliArgs)

$ErrorActionPreference = "Stop"

if (-not $CliArgs -or $CliArgs.Count -eq 0) {
    Write-Host "usage: scripts/sb.ps1 <supabase-cli arguments...>"
    exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$cliVersion = "2.115.0"
$cliPath = Join-Path $repoRoot "tools\supabase\supabase.exe"

if (-not (Test-Path $cliPath)) {
    Write-Host "Downloading Supabase CLI v$cliVersion into tools\supabase (one time, ~130 MB)..."
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $cliPath) | Out-Null
    $archive = Join-Path $env:TEMP "supabase_cli_$cliVersion.tar.gz"
    Invoke-WebRequest `
        -Uri "https://github.com/supabase/cli/releases/download/v$cliVersion/supabase_windows_amd64.tar.gz" `
        -OutFile $archive -UseBasicParsing
    tar -xzf $archive -C (Split-Path -Parent $cliPath) supabase.exe
    Remove-Item $archive
}

$token = $env:SUPABASE_ACCESS_TOKEN
if (-not $token) {
    # Fall back to the repo-local secret file so nobody has to remember to
    # export anything: .supabase-access-token is gitignored.
    $tokenFile = Join-Path $repoRoot ".supabase-access-token"
    if (Test-Path $tokenFile) {
        $token = (Get-Content $tokenFile -Raw).Trim()
    }
}
if (-not $token) {
    Write-Host "SUPABASE_ACCESS_TOKEN is not set."
    Write-Host "Get one at https://supabase.com/dashboard/account/tokens then either:"
    Write-Host '  $env:SUPABASE_ACCESS_TOKEN = "sbp_..."'
    Write-Host "or save it once into .supabase-access-token at the repo root."
    exit 1
}

$env:SUPABASE_ACCESS_TOKEN = $token
& $cliPath @CliArgs
exit $LASTEXITCODE
