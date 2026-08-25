# One button on the new machine.
#
# Everything after cloning the repository: find the bundle, put the secrets and
# the n8n volumes back, and start. Written to be run by double-clicking
# RESTORE.bat, by someone who has just switched computers and does not want to
# think about any of this.
#
# The bundle is looked for rather than asked for. Someone who has just copied a
# folder off a USB drive should not have to type its path, and the places it
# could plausibly be are few enough to check.

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Step($t) { Write-Host ""; Write-Host ("==> " + $t) -ForegroundColor Cyan }
function Ok($t)   { Write-Host ("    OK  " + $t) -ForegroundColor Green }
function Warn($t) { Write-Host ("    !!  " + $t) -ForegroundColor Yellow }
function Fail($en, $ar) {
    Write-Host ""
    Write-Host ("    X  " + $en) -ForegroundColor Red
    if ($ar) { Write-Host ("       " + $ar) -ForegroundColor Red }
}

Write-Host ""
Write-Host "============ Steinheim - restore and start ============" -ForegroundColor White

# ---------------------------------------------------------------------------
# 1. Find the bundle
# ---------------------------------------------------------------------------
Step "Looking for the move bundle"

# A bundle is a folder holding .env. Checking for the file rather than the
# folder name means a renamed folder still works, and an empty folder left over
# from a previous attempt does not.
function Test-Bundle($path) {
    return (Test-Path $path) -and (Test-Path (Join-Path $path ".env"))
}

$candidates = @(
    (Join-Path $repoRoot "steinheim-move"),
    (Join-Path (Split-Path -Parent $repoRoot) "steinheim-move"),
    "D:\steinheim-move",
    "C:\steinheim-move",
    (Join-Path ([Environment]::GetFolderPath("Desktop")) "steinheim-move"),
    (Join-Path ([Environment]::GetFolderPath("UserProfile")) "Downloads\steinheim-move")
)

# Removable drives last: they are the most likely place and the slowest to
# probe, so the local copies get checked first.
foreach ($drive in [System.IO.DriveInfo]::GetDrives()) {
    if ($drive.IsReady -and $drive.DriveType -eq "Removable") {
        $candidates += (Join-Path $drive.RootDirectory.FullName "steinheim-move")
    }
}

$bundle = $null
foreach ($c in $candidates) {
    if (Test-Bundle $c) { $bundle = (Resolve-Path $c).Path; break }
}

if (-not $bundle) {
    Fail "No move bundle found." `
         "محصلش لقيت حزمة النقل. انسخ مجلد steinheim-move جنب المشروع أو على D:\ وشغّل تاني."
    Write-Host ""
    Write-Host "    Looked in:" -ForegroundColor DarkGray
    foreach ($c in $candidates) { Write-Host ("      " + $c) -ForegroundColor DarkGray }
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}
Ok $bundle

# ---------------------------------------------------------------------------
# 2. Docker
# ---------------------------------------------------------------------------
Step "Docker"

function Test-DockerEngine {
    try {
        docker info --format "{{.ServerVersion}}" 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}

if (-not (Test-DockerEngine)) {
    $dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (-not (Test-Path $dockerDesktop)) {
        Fail "Docker Desktop is not installed." `
             "Docker Desktop مش متثبت. ثبّته من https://www.docker.com/products/docker-desktop وشغّل الزر تاني."
        Read-Host "Press Enter to close"
        exit 1
    }
    Warn "Starting Docker Desktop (first start can take a minute)..."
    Start-Process $dockerDesktop | Out-Null
    $deadline = (Get-Date).AddSeconds(180)
    while (-not (Test-DockerEngine)) {
        if ((Get-Date) -gt $deadline) {
            Fail "Docker did not come up within 3 minutes." `
                 "Docker ماقامش. افتح Docker Desktop يدويًا واستنى يخلص، وبعدين دوس الزر تاني."
            Read-Host "Press Enter to close"
            exit 1
        }
        Start-Sleep -Seconds 5
    }
}
Ok "Docker is running"

# ---------------------------------------------------------------------------
# 3. Restore
# ---------------------------------------------------------------------------
Step "Restoring secrets and automation data"

& (Join-Path $PSScriptRoot "move-machine.ps1") restore -Path $bundle
if ($LASTEXITCODE -ne 0) {
    Fail "Restore failed - see the messages above." "الاسترجاع فشل - اقرا الرسايل اللي فوق."
    Read-Host "Press Enter to close"
    exit 1
}

# ---------------------------------------------------------------------------
# 4. Start
# ---------------------------------------------------------------------------
Step "Starting everything"
Write-Host "    This is the slow part on a new machine - it builds the image." -ForegroundColor DarkGray

& (Join-Path $PSScriptRoot "start.ps1")
$startExit = $LASTEXITCODE

if ($startExit -eq 0) {
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host "   Everything is running on this machine." -ForegroundColor Green
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "   The Telegram webhook was re-registered on the new address," -ForegroundColor White
    Write-Host "   so the bot and the group work as before. Nobody needs to" -ForegroundColor White
    Write-Host "   run /register again - the approvers are in the database." -ForegroundColor White
    Write-Host ""
    Write-Host "   Now delete the bundle from both machines:" -ForegroundColor Yellow
    Write-Host ("     " + $bundle) -ForegroundColor Yellow
    Write-Host "   It holds live secrets." -ForegroundColor Yellow
    Write-Host ""
}

Read-Host "Press Enter to close"
