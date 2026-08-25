# Steinheim — one-button launcher.
#
# Started by START.bat at the repo root (double-click). Brings the whole stack
# up on any machine, from scratch, in order:
#
#   1. Docker Desktop running (starts it, waits for the engine)
#   2. .env present at the repo root (copies the example and stops for a
#      fill-in on first run) — ONE env file for the whole stack; compose,
#      workflow templates and scripts all read this same file
#   3. app + n8n + n8n-db containers up and rebuilt when code changed
#   4. health checks pass
#   5. n8n workflows deployed — only when templates actually changed, tracked
#      by a content hash, so re-running never duplicates anything
#   6. browser opens on the dashboard
#
# Designed to be run by someone who has never seen a terminal. Everything is
# idempotent: after a reboot, sleep, power cut or network change, pressing the
# button again simply converges to "everything running".

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$composeArgs = @(
    "--env-file", (Join-Path $repoRoot ".env"),
    "-f", (Join-Path $repoRoot "infra\selfhost\docker-compose.yml")
)

function Step($title) {
    Write-Host ""
    Write-Host ("==> " + $title) -ForegroundColor Cyan
}
function Ok($text)   { Write-Host ("    OK  " + $text) -ForegroundColor Green }
function Warn($text) { Write-Host ("    !!  " + $text) -ForegroundColor Yellow }
function Fail($en, $ar) {
    Write-Host ""
    Write-Host ("    X  " + $en) -ForegroundColor Red
    if ($ar) { Write-Host ("       " + $ar) -ForegroundColor Red }
}

Write-Host ""
Write-Host "================ Steinheim launcher ===============" -ForegroundColor White

# ---------------------------------------------------------------------------
# 1. Docker engine
# ---------------------------------------------------------------------------
Step "Docker"

function Test-DockerEngine {
    try {
        docker info --format "{{.ServerVersion}}" 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}

if (Test-DockerEngine) {
    Ok "Docker is running"
} else {
    $dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (-not (Test-Path $dockerDesktop)) {
        Fail "Docker Desktop is not installed." `
             "Docker Desktop مش متثبت. ثبّته من https://www.docker.com/products/docker-desktop وشغّل الزر تاني."
        exit 1
    }
    Warn "Starting Docker Desktop (first start can take a minute)..."
    Start-Process $dockerDesktop | Out-Null

    $deadline = (Get-Date).AddSeconds(180)
    while (-not (Test-DockerEngine)) {
        if ((Get-Date) -gt $deadline) {
            Fail "Docker did not come up within 3 minutes." `
                 "Docker ماقامش خلال ٣ دقايق. افتح Docker Desktop يدويًا واستنى يخلص، وبعدين دوس الزر تاني."
            exit 1
        }
        Start-Sleep -Seconds 5
    }
    Ok "Docker engine is up"
}

# ---------------------------------------------------------------------------
# 2. Secrets file
# ---------------------------------------------------------------------------
Step "Configuration"

$envFile = Join-Path $repoRoot ".env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $repoRoot ".env.selfhost.example") $envFile
    Warn ".env was missing — created it from the example."
    Notepad $envFile
    Fail "Fill the values in the notepad window that just opened, save it, then press the button again." `
         "املأ القيم اللي في النوتباد اللي فتح، احفظ الملف، وبعدين دوس الزر تاني."
    exit 1
}
Ok ".env found"

# ---------------------------------------------------------------------------
# 3. Containers up
# ---------------------------------------------------------------------------
Step "Building and starting containers (this is the slow part)"

# No 2>&1 here on purpose: under $ErrorActionPreference='Stop', PowerShell 5.1
# turns every stderr progress line from docker into a terminating error.
& docker compose @composeArgs up -d --build
if ($LASTEXITCODE -ne 0) {
    Fail "docker compose failed — see the messages above." `
         "التشغيل فشل — اقرا الرسايل اللي فوق، وغالبًا إعادة تشغيل الجهاز بتحلها."
    exit 1
}
Ok "containers created"

# ---------------------------------------------------------------------------
# 4. Health waits
# ---------------------------------------------------------------------------
Step "Waiting for services to become healthy"

function Wait-Alive($name, $url, $seconds) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            # Any HTTP answer means the service is listening; the status code
            # itself is the service's business.
            Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 | Out-Null
            Ok "$name is healthy"
            return $true
        } catch {
            $response = $_.Exception.Response
            if ($response) { Ok "$name is healthy"; return $true }
            Start-Sleep -Seconds 3
        }
    }
    Fail "$name did not become healthy within $seconds seconds." `
         "$name جاهزش خلال الوقت المتاح. جرّب تقفل Docker Desktop وتفتحه وتدوس الزر تاني."
    return $false
}

if (-not (Wait-Alive "app" "http://localhost:3000/auth" 120)) { exit 1 }
if (-not (Wait-Alive "n8n" "http://localhost:5678/healthz" 90)) { exit 1 }

# ---------------------------------------------------------------------------
# 5. Deploy n8n workflows — only when something changed
# ---------------------------------------------------------------------------
Step "Automation workflows"

$workflowsDir = Join-Path $repoRoot "infra\n8n\workflows"
$readyDir = Join-Path $workflowsDir "ready"
$markerFile = Join-Path $readyDir ".deployed.json"

# The templates carry placeholders; their real values come from .env so a new
# machine deploys with its own URLs without touching git-tracked files.
$selfEnv = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$') { $selfEnv[$Matches[1]] = $Matches[2] }
}
$appUrl = "$($selfEnv["APP_URL"])"
if (-not $appUrl) { $appUrl = "http://localhost:3000" }
$appUrl = $appUrl.TrimEnd("/")
$chatId = $selfEnv["TELEGRAM_CHAT_ID"]
$channelId = "$($selfEnv["TELEGRAM_CHANNEL_ID"])"
if (-not $channelId) { $channelId = $chatId }

# Hash covers both the templates and the values baked into them.
$hashInput = Get-ChildItem $workflowsDir -Filter "W*.json" | Sort-Object Name |
    Get-Content -Raw
$deployState = "$appUrl|$chatId|$channelId|" + (($hashInput -join "`n") -replace '\r', '')
$bytes = [System.Text.Encoding]::UTF8.GetBytes($deployState)
$sha = [System.Security.Cryptography.SHA256]::Create()
$currentHash = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLower()

$previousHash = ""
if (Test-Path $markerFile) {
    try { $previousHash = (Get-Content $markerFile -Raw | ConvertFrom-Json).hash } catch {}
}

if ($currentHash -eq $previousHash) {
    Ok "workflows already match the repo (nothing changed)"
} elseif (-not $chatId) {
    Warn "TELEGRAM_CHAT_ID not set in .env — skipping workflow deploy."
    Warn "The n8n UI will have no workflows; add the chat id and press the button again."
} else {
    New-Item -ItemType Directory -Force -Path $readyDir | Out-Null
    foreach ($template in Get-ChildItem $workflowsDir -Filter "W*.json" | Sort-Object Name) {
        $filled = (Get-Content $template.FullName -Raw)
        $filled = $filled.Replace("__APP_URL__", $appUrl)
        $filled = $filled.Replace("__TELEGRAM_CHAT_ID__", $chatId)
        $filled = $filled.Replace("__TELEGRAM_CHANNEL_ID__", $channelId)
        $out = Join-Path $readyDir $template.Name
        [System.IO.File]::WriteAllText($out, $filled)

        # JSON sanity before it reaches n8n — a typo must stop here, not there.
        try { ConvertFrom-Json $filled | Out-Null } catch {
            Fail "$($template.Name) is not valid JSON after filling placeholders: $($error[0].Exception.Message)"
            exit 1
        }

        & docker compose @composeArgs cp $out "n8n:/tmp/$($template.Name)" | Out-Null
        & docker compose @composeArgs exec -T n8n n8n import:workflow --input="/tmp/$($template.Name)" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Fail "importing $($template.Name) into n8n failed."
            exit 1
        }
        Ok "deployed $($template.Name)"
    }
    @{ hash = $currentHash; deployedAt = (Get-Date -Format "o") } |
        ConvertTo-Json | Set-Content $markerFile

    Write-Host ""
    Warn "If an older copy of these workflows exists in n8n, delete it in the UI —"
    Warn "imports create a new workflow instead of updating, and two schedulers firing twice is worse than one."
}

# ---------------------------------------------------------------------------
# 6. Open the dashboard
# ---------------------------------------------------------------------------
Step "Ready"

Start-Process "http://localhost:3000"

Write-Host ""
Ok "Dashboard : http://localhost:3000"
Ok "n8n       : http://localhost:5678"
Write-Host ""
Write-Host "    First time on this machine? In n8n create the owner account, then"
Write-Host "    re-select credentials inside each imported workflow once."
Write-Host "    أول مرة؟ اعمل حساب في n8n وأعد اختيار الـ credentials جوه كل workflow."
Write-Host ""
Write-Host "    To stop everything: double-click STOP.bat"
Write-Host "    عشان تقفل كله: دوس على STOP.bat"
Write-Host "=====================================================" -ForegroundColor White
