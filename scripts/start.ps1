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

# --- Telegram webhook --------------------------------------------------------
# Telegram delivers bot messages only to the URL it has on file. Registering
# on every boot means a reboot, a network change or a whole new machine
# converges to a working bot without anyone remembering this step exists.
$tgToken = "$($selfEnv["TELEGRAM_BOT_TOKEN"])"
$publicUrl = "$($selfEnv["PUBLIC_URL"])".TrimEnd("/")
$tgSecret = "$($selfEnv["TELEGRAM_WEBHOOK_SECRET"])"
$webhookRegistered = $false

function Register-TelegramWebhook([string]$url) {
    $hookPath = "$url/api/public/telegram/webhook"
    $respFile = [System.IO.Path]::GetTempFileName()
    & curl.exe -s --max-time 20 `
        "https://api.telegram.org/bot$tgToken/setWebhook?url=$([uri]::EscapeDataString($hookPath))&secret_token=$([uri]::EscapeDataString($tgSecret))" `
        -o $respFile
    try {
        $resp = Get-Content $respFile -Raw | ConvertFrom-Json
        Remove-Item $respFile -Force -ErrorAction SilentlyContinue
        return $resp.ok
    } catch {
        Remove-Item $respFile -Force -ErrorAction SilentlyContinue
        return $false
    }
}

if ($tgToken) {
    # Try the configured PUBLIC_URL first.
    if ($publicUrl) {
        try {
            $testReq = Invoke-WebRequest -Uri "$publicUrl/api/public/automation/analytics" -UseBasicParsing -TimeoutSec 10
            if (Register-TelegramWebhook $publicUrl) {
                Ok "telegram webhook registered at $publicUrl"
                $webhookRegistered = $true
            }
        } catch {}
    }

    # Fallback: spin up a Cloudflare quick tunnel (no DNS, no token needed).
    # The URL changes on every boot, but we re-register on every boot anyway.
    if (-not $webhookRegistered) {
        Warn "PUBLIC_URL unreachable — starting a Cloudflare quick tunnel (temporary URL)..."

        # Find the compose network so the tunnel can reach the app container.
        $netName = ""
        try {
            $netName = & docker network ls --filter "name=selfhost" --format "{{.Name}}" 2>$null |
                Select-Object -First 1
        } catch {}
        if (-not $netName) { $netName = "selfhost_default" }

        # Remove any leftover quick-tunnel container from a previous run.
        & docker rm -f steinheim-quick-tunnel 2>$null | Out-Null

        # Start cloudflared in the background. It prints the URL to stderr.
        $proc = Start-Process -FilePath "docker" -ArgumentList @(
            "run", "-d", "--name", "steinheim-quick-tunnel",
            "--network", $netName, "--restart", "unless-stopped",
            "cloudflare/cloudflared:latest",
            "tunnel", "--url", "http://app:3000"
        ) -PassThru -NoNewWindow

        # Wait for the URL to appear in container logs (up to 60 seconds).
        $tunnelUrl = ""
        $deadline = (Get-Date).AddSeconds(60)
        while ((Get-Date) -lt $deadline) {
            Start-Sleep -Seconds 3
            $logs = & docker logs steinheim-quick-tunnel 2>&1
            $match = [regex]::Match(($logs | Out-String), "https://[a-z0-9-]+\.trycloudflare\.com")
            if ($match.Success) {
                $tunnelUrl = $match.Value
                break
            }
        }

        if ($tunnelUrl) {
            if (Register-TelegramWebhook $tunnelUrl) {
                Ok "telegram webhook registered at $tunnelUrl"
                $webhookRegistered = $true
            } else {
                Warn "webhook registration failed — the bot will not receive messages until you set PUBLIC_URL."
            }
        } else {
            Warn "quick tunnel did not produce a URL in time — the bot will not receive messages."
        }
    }
} else {
    Warn "TELEGRAM_BOT_TOKEN not set — skipping webhook registration."
}

# --- n8n session -----------------------------------------------------------
# The launcher manages n8n itself (owner account + the shared header-auth
# credential) so a fresh machine never needs a manual click inside the n8n UI.
# All calls go through curl.exe: n8n marks its auth cookie Secure, and .NET's
# web-session stack refuses to send Secure cookies over plain-http localhost,
# while an explicit cookie header works everywhere.
$n8nRest = "http://localhost:5678/rest"
$ownerEmail = "$($selfEnv["N8N_OWNER_EMAIL"])"
$ownerPassword = "$($selfEnv["N8N_OWNER_PASSWORD"])"
$script:authCookie = ""

function Invoke-N8nJson {
    # POST/GET JSON against the n8n REST API with the session cookie.
    param([string]$Method, [string]$Path, [string]$Body = "")
    $outFile = [System.IO.Path]::GetTempFileName()
    $args = @("-s", "-X", $Method, "-H", "cookie: n8n-auth=$script:authCookie")
    if ($Body) {
        $bodyFile = [System.IO.Path]::GetTempFileName()
        [System.IO.File]::WriteAllText($bodyFile, $Body)
        $args += @("-H", "Content-Type: application/json", "--data-binary", "@$bodyFile")
    }
    $args += @("-o", $outFile, "$n8nRest$Path")
    & curl.exe @args | Out-Null
    $raw = [System.IO.File]::ReadAllText($outFile)
    Remove-Item $outFile -Force -ErrorAction SilentlyContinue
    if ($Body) { Remove-Item $bodyFile -Force -ErrorAction SilentlyContinue }
    if (-not $raw) { throw "empty response from $Path" }
    return ($raw | ConvertFrom-Json)
}

if (-not $ownerEmail -or -not $ownerPassword) {
    Warn "N8N_OWNER_EMAIL / N8N_OWNER_PASSWORD missing from .env — skipping workflow deploy."
} else {
    $hdrFile = [System.IO.Path]::GetTempFileName()
    $loginBodyFile = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText(
        $loginBodyFile,
        (@{ emailOrLdapLoginId = $ownerEmail; password = $ownerPassword } | ConvertTo-Json))

    & curl.exe -s -X POST -H "Content-Type: application/json" `
        --data-binary "@$loginBodyFile" -D "$hdrFile" -o NUL "$n8nRest/login"
    $m = [regex]::Match([System.IO.File]::ReadAllText($hdrFile), "n8n-auth=([^;\r\n]+)")
    if ($m.Success) { $script:authCookie = $m.Groups[1].Value }

    if (-not $script:authCookie) {
        # First boot has no owner yet — create it from .env, then log in.
        [System.IO.File]::WriteAllText(
            $loginBodyFile,
            (@{ email = $ownerEmail; firstName = "Steinheim"; lastName = "Owner"
                password = $ownerPassword } | ConvertTo-Json))
        & curl.exe -s -X POST -H "Content-Type: application/json" `
            --data-binary "@$loginBodyFile" -o NUL "$n8nRest/owner/setup"
        & curl.exe -s -X POST -H "Content-Type: application/json" `
            --data-binary "@$loginBodyFile" -D "$hdrFile" -o NUL "$n8nRest/login" 2>$null
        $m = [regex]::Match([System.IO.File]::ReadAllText($hdrFile), "n8n-auth=([^;\r\n]+)")
        if ($m.Success) { $script:authCookie = $m.Groups[1].Value }
        if ($script:authCookie) {
            Ok "created the n8n owner account and logged in"
        } else {
            Fail "could not create/log into n8n with N8N_OWNER_EMAIL/PASSWORD." `
                 "مقدرتش أدخل على n8n بالقيم اللي في الملف. راجع N8N_OWNER_EMAIL و N8N_OWNER_PASSWORD في .env ودوس الزر تاني."
            exit 1
        }
    } else {
        Ok "logged into n8n as $ownerEmail"
    }
    Remove-Item $hdrFile, $loginBodyFile -Force -ErrorAction SilentlyContinue

    # Shared credential for app→n8n calls: reuse it when it exists so repeated
    # runs never duplicate entries.
    $credName = "Steinheim automation secret"
    try {
        $credList = Invoke-N8nJson -Method GET -Path "/credentials"
        $existing = @($credList.data) | Where-Object { $_.name -eq $credName } | Select-Object -First 1
    } catch { $existing = $null }
    if ($existing) {
        $credId = $existing.id
        Ok "credential '$credName' already exists"
    } else {
        $created = Invoke-N8nJson -Method POST -Path "/credentials" -Body (
            @{
                name = $credName; type = "httpHeaderAuth"
                data = @{ name = "x-automation-secret"; value = "$($selfEnv["AUTOMATION_SECRET"])" }
            } | ConvertTo-Json -Depth 5)
        $credId = $created.data.id
        if ($credId) { Ok "credential '$credName' created" }
        else { Warn "could not create '$credName' — workflows will need it picked manually." }
    }
}

# Hash covers the templates plus every value baked into them.
$hashInput = Get-ChildItem $workflowsDir -Filter "W*.json" | Sort-Object Name |
    Get-Content -Raw -Encoding UTF8
$deployState = "$appUrl|$chatId|$channelId|$credId|" + (($hashInput -join "`n") -replace '\r', '')
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
} elseif (-not $credId) {
    Warn "no n8n session (see warnings above) — skipping workflow deploy."
} else {
    New-Item -ItemType Directory -Force -Path $readyDir | Out-Null
    foreach ($template in Get-ChildItem $workflowsDir -Filter "W*.json" | Sort-Object Name) {
        # -Encoding UTF8 matters: PS 5.1 otherwise assumes ANSI for the BOM-less
        # templates and turns every em-dash in a workflow name into mojibake.
        $filled = (Get-Content $template.FullName -Raw -Encoding UTF8)
        $filled = $filled.Replace("__APP_URL__", $appUrl)
        $filled = $filled.Replace("__TELEGRAM_CHAT_ID__", $chatId)
        $filled = $filled.Replace("__TELEGRAM_CHANNEL_ID__", $channelId)
        $filled = $filled.Replace("REPLACE_WITH_CREDENTIAL_ID", $credId)
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

    # Import lands workflows inactive; switch each one on so its schedule runs.
    foreach ($template in Get-ChildItem $workflowsDir -Filter "W*.json" | Sort-Object Name) {
        try {
            $wfId = ((Get-Content $template.FullName -Raw -Encoding UTF8 | ConvertFrom-Json).id)
            $wf = Invoke-N8nJson -Method GET -Path "/workflows/$wfId"
            if (-not $wf.data.active) {
                Invoke-N8nJson -Method POST -Path "/workflows/$wfId/activate" -Body (
                    @{ versionId = $wf.data.versionId } | ConvertTo-Json) | Out-Null
            }
            Ok "activated $($template.Name)"
        } catch {
            Warn "could not activate $($template.Name) — enable it once in the n8n UI."
        }
    }

    @{ hash = $currentHash; deployedAt = (Get-Date -Format "o") } |
        ConvertTo-Json | Set-Content $markerFile

    # Templates carry fixed workflow ids, so n8n upserts: redeploys update the
    # existing workflow in place instead of piling up copies.
    Ok "workflows are up to date in n8n"
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
    Write-Host "    n8n owner + credentials were set up automatically from .env."
    Write-Host "    أول تشغيل؟ كل حاجة في n8n اتعملت لوحدها من قيم الملف."
    Write-Host ""
    Write-Host "    To stop everything: double-click STOP.bat"
    Write-Host "    عشان تقفل كله: دوس على STOP.bat"
Write-Host "=====================================================" -ForegroundColor White
