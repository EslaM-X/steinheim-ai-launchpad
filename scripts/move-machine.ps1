# Moves this installation to another computer.
#
# Almost nothing needs to travel. The catalogue, the claims, the posts, the
# plates and the campaign assets are in Supabase; the code and the workflow
# templates are in git; the Telegram approvers are a row in the database. A new
# machine clones the repository, restores what this script packs, and is the
# same install.
#
# Two things are genuinely local:
#
#   .env          every secret. It is deliberately not in git, so nothing else
#                 can carry it across.
#   n8n volumes   the automation's own database - its credentials and its
#                 execution history. The workflows themselves are in the repo
#                 and the launcher re-imports them, so this is optional; skip
#                 it and re-enter the two n8n credentials by hand instead.
#
#   scripts/move-machine.ps1 backup   -> writes .\steinheim-move\
#   scripts/move-machine.ps1 restore  -> reads it back on the new machine
#
# The backup folder holds live credentials. Move it on a USB drive or an
# encrypted transfer, and delete it from both machines afterwards.

param(
    [Parameter(Position = 0)]
    [ValidateSet("backup", "restore")]
    [string]$Action = "backup",

    [string]$Path = ".\steinheim-move"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Step($text) { Write-Host ("==> " + $text) -ForegroundColor Cyan }
function Ok($text) { Write-Host ("    OK  " + $text) -ForegroundColor Green }
function Warn($text) { Write-Host ("    !!  " + $text) -ForegroundColor Yellow }

function Test-Docker {
    try {
        docker info --format "{{.ServerVersion}}" 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}

# Volume contents are tarred from inside a throwaway container, because a named
# volume has no path on the host that can be copied.
function Save-Volume($name, $outFile) {
    $dir = Split-Path -Parent $outFile
    $file = Split-Path -Leaf $outFile
    docker run --rm -v "${name}:/from" -v "${dir}:/to" alpine `
        sh -c "cd /from && tar czf /to/$file ." 2>$null
    return $LASTEXITCODE -eq 0
}

function Restore-Volume($name, $inFile) {
    $dir = Split-Path -Parent $inFile
    $file = Split-Path -Leaf $inFile
    docker volume create $name | Out-Null
    docker run --rm -v "${name}:/to" -v "${dir}:/from" alpine `
        sh -c "cd /to && tar xzf /from/$file" 2>$null
    return $LASTEXITCODE -eq 0
}

if ($Action -eq "backup") {
    Write-Host ""
    Write-Host "=========== Steinheim - pack for the move ===========" -ForegroundColor White

    Step "Checking the repository is pushed"
    $unpushed = (git log --oneline "origin/main..HEAD" 2>$null | Measure-Object -Line).Lines
    if ($unpushed -gt 0) {
        Warn "$unpushed commit(s) are not on GitHub. Push them, or they stay on this machine."
    } else {
        Ok "everything is on GitHub"
    }

    New-Item -ItemType Directory -Force -Path $Path | Out-Null
    $full = (Resolve-Path $Path).Path

    Step "Secrets"
    $copied = 0
    foreach ($f in @(".env", ".env.golive", ".env.local")) {
        if (Test-Path $f) {
            Copy-Item $f (Join-Path $full $f) -Force
            Ok $f
            $copied++
        }
    }
    if ($copied -eq 0) { Warn "no .env found - check you are in the right folder" }

    Step "n8n data"
    if (Test-Docker) {
        foreach ($v in @("selfhost_n8n_data", "selfhost_n8n_db")) {
            $exists = docker volume ls --format "{{.Name}}" | Where-Object { $_ -eq $v }
            if (-not $exists) { Warn "$v does not exist - skipping"; continue }
            if (Save-Volume $v (Join-Path $full "$v.tar.gz")) { Ok $v } else { Warn "$v failed to pack" }
        }
    } else {
        Warn "Docker is not running - n8n credentials and history will not travel."
        Warn "That is survivable: re-enter the two n8n credentials on the new machine."
    }

    # A note in the folder, because the folder may be opened days later on a
    # machine that has none of this context.
    @(
        "Steinheim - moving to another computer",
        "",
        "On the new machine:",
        "",
        "  1. Install Docker Desktop and Git.",
        "  2. git clone https://github.com/EslaM-X/steinheim-ai-launchpad.git",
        "  3. Copy this whole folder next to the clone.",
        "  4. In the clone, run:  scripts/move-machine.ps1 restore -Path ..\steinheim-move",
        "  5. Double-click START.bat",
        "",
        "Everything else is already in the cloud: the catalogue, the claims, the",
        "posts, the plates, the campaign assets and the Telegram approvers all",
        "live in Supabase, and the code is on GitHub.",
        "",
        "This folder contains live credentials. Delete it from both machines",
        "once the new one is running."
    ) | Set-Content -Path (Join-Path $full "READ-ME-FIRST.txt") -Encoding utf8

    Write-Host ""
    Ok "packed into $full"
    Warn "it holds live secrets - carry it on a USB drive, not by email"
    Write-Host ""
}
else {
    Write-Host ""
    Write-Host "========== Steinheim - restore on this machine ==========" -ForegroundColor White

    if (-not (Test-Path $Path)) {
        Write-Host ("    X  " + $Path + " not found") -ForegroundColor Red
        exit 1
    }
    $full = (Resolve-Path $Path).Path

    Step "Secrets"
    foreach ($f in @(".env", ".env.golive", ".env.local")) {
        $src = Join-Path $full $f
        if (Test-Path $src) {
            # Never silently overwrite: a half-configured .env on the new
            # machine is easier to fix than one that has been replaced.
            if (Test-Path $f) {
                Warn "$f already exists here - saved the incoming copy as $f.incoming"
                Copy-Item $src "$f.incoming" -Force
            } else {
                Copy-Item $src $f -Force
                Ok $f
            }
        }
    }

    Step "n8n data"
    if (Test-Docker) {
        foreach ($v in @("selfhost_n8n_data", "selfhost_n8n_db")) {
            $tar = Join-Path $full "$v.tar.gz"
            if (-not (Test-Path $tar)) { Warn "$v.tar.gz not in the folder - skipping"; continue }
            if (Restore-Volume $v $tar) { Ok $v } else { Warn "$v failed to restore" }
        }
    } else {
        Warn "Docker is not running. Start Docker Desktop and run restore again."
    }

    Write-Host ""
    Ok "restored - now double-click START.bat"
    Write-Host ""
    Write-Host "    The public address changes on a new machine, so the Telegram" -ForegroundColor Yellow
    Write-Host "    webhook is re-registered automatically on first launch." -ForegroundColor Yellow
    Write-Host ""
}
