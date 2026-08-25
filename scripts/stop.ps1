# Steinheim — one-button stop. Containers stop, volumes (database rows, n8n
# credentials, workflow history) are kept. START.bat brings everything back.

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "==> Stopping Steinheim containers..." -ForegroundColor Cyan

& docker compose `
    --env-file (Join-Path $repoRoot ".env") `
    -f (Join-Path $repoRoot "infra\selfhost\docker-compose.yml") stop

Write-Host ""
Write-Host "    OK  stopped — data is kept." -ForegroundColor Green
Write-Host "    وقف كله، والبيانات محفوظة. START.bat يرجع كل حاجة."
Write-Host ""
