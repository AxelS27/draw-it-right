param([switch]$SmokeTest)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$worker = Join-Path $root 'worker'
# Keep the venv in a short path: TensorFlow's headers can exceed Windows MAX_PATH
# when a fresh clone lives in a long user/Temp folder.
$legacyVenv = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
$venvDir = if (Test-Path $legacyVenv) { Join-Path $PSScriptRoot '.venv' } else { Join-Path $env:LOCALAPPDATA 'DrawItRight\venv' }
$venvPython = Join-Path $venvDir 'Scripts\python.exe'
$secretFile = Join-Path $PSScriptRoot '.local-secret'
$cloudflared = Join-Path $PSScriptRoot 'cloudflared.exe'
$serverLog = Join-Path $PSScriptRoot 'model-server.log'
$tunnelLog = Join-Path $PSScriptRoot 'model-tunnel.log'
$server = $null
$tunnel = $null
Set-Location $root

function Assert-Success($message) {
    if ($LASTEXITCODE -ne 0) { throw $message }
}

function Wait-ForHealth($url, $seconds) {
    for ($i = 0; $i -lt $seconds; $i++) {
        try {
            if ((Invoke-RestMethod -Uri "$url/health" -TimeoutSec 3).ok) { return }
        } catch { }
        Start-Sleep -Seconds 1
    }
    throw "Model service is not reachable at $url/health"
}

try {
    if (-not (Test-Path $venvPython)) {
        $launcher = $null
        # Windows PowerShell 5 treats stderr from a missing py version as a terminating
        # NativeCommandError when ErrorActionPreference is Stop. Probe with Continue.
        $previousPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            if (Get-Command py -ErrorAction SilentlyContinue) {
                foreach ($version in @('-3.11', '-3.10')) {
                    & py $version -c 'import sys; sys.exit(not (3, 10) <= sys.version_info[:2] <= (3, 11))' 2>$null | Out-Null
                    if ($LASTEXITCODE -eq 0) { $launcher = @('py', $version); break }
                }
            }
            if (-not $launcher -and (Get-Command python -ErrorAction SilentlyContinue)) {
                & python -c 'import sys; sys.exit(not (3, 10) <= sys.version_info[:2] <= (3, 11))' 2>$null | Out-Null
                if ($LASTEXITCODE -eq 0) { $launcher = @('python') }
            }
        } finally { $ErrorActionPreference = $previousPreference }
        if (-not $launcher) { throw 'Install Python 3.10 or 3.11 from python.org, then run start-model.bat again.' }
        Write-Host 'Creating Python environment...'
        if ($launcher.Count -eq 2) { & $launcher[0] $launcher[1] -m venv $venvDir }
        else { & $launcher[0] -m venv $venvDir }
        Assert-Success 'Could not create the Python environment.'
    }

    Write-Host 'Checking model dependencies and artifact...'
    & $venvPython -m pip install --disable-pip-version-check -q -r (Join-Path $PSScriptRoot 'requirements.txt')
    Assert-Success 'Python dependencies failed to install.'
    & $venvPython (Join-Path $PSScriptRoot 'download-model.py')
    Assert-Success 'Could not verify the model artifact.'

    if (-not (Test-Path $cloudflared)) {
        Write-Host 'Downloading cloudflared from the official Cloudflare GitHub release...'
        $temporary = "$cloudflared.download"
        try {
            Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $temporary -UseBasicParsing
            Move-Item -Force $temporary $cloudflared
        } finally { Remove-Item $temporary -Force -ErrorAction SilentlyContinue }
    }
    & $cloudflared --version
    Assert-Success 'cloudflared could not run.'

    if (-not (Test-Path $secretFile)) {
        $newSecret = (& $venvPython -c 'import secrets; print(secrets.token_urlsafe(32))').Trim()
        Assert-Success 'Could not generate an inference secret.'
        [System.IO.File]::WriteAllText($secretFile, $newSecret)
        Remove-Variable newSecret
        Write-Host 'Created a private local secret (not included in Git).'
    }
    $secret = [System.IO.File]::ReadAllText($secretFile).Trim()
    if ($secret.Length -lt 32) { throw 'The local inference secret is too short.' }

    if (-not $SmokeTest) {
        if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Install Node.js 20+ from nodejs.org before starting the model.' }
        $wrangler = Join-Path $worker 'node_modules\.bin\wrangler.cmd'
        if (-not (Test-Path $wrangler)) {
            Write-Host 'Installing Worker tools from worker/package-lock.json...'
            & npm ci --prefix $worker
            Assert-Success 'Could not install Worker tools.'
        }
        Write-Host 'Checking Cloudflare login...'
        Push-Location $worker
        try {
            & $wrangler whoami
            if ($LASTEXITCODE -ne 0) {
                Write-Host 'A browser login is required once for the Cloudflare account that owns this game Worker.'
                & $wrangler login
                Assert-Success 'Cloudflare login failed.'
                & $wrangler whoami
                Assert-Success 'Cloudflare login could not be verified.'
            }
            & npm run build
            Assert-Success 'Worker type check failed.'
        } finally { Pop-Location }
    }

    try {
        if ((Invoke-RestMethod -Uri 'http://127.0.0.1:8080/health' -TimeoutSec 2).ok) {
            throw 'Port 8080 is already serving a model. Stop the old start-model.bat before starting another.'
        }
    } catch {
        if ($_.Exception.Message -like 'Port 8080*') { throw }
    }
    Remove-Item $serverLog, $tunnelLog -Force -ErrorAction SilentlyContinue
    $env:INFERENCE_SECRET = $secret
    $server = Start-Process -FilePath $venvPython -ArgumentList 'model-service/server.py' -WorkingDirectory $root -PassThru -RedirectStandardOutput $serverLog -RedirectStandardError (Join-Path $PSScriptRoot 'model-server-errors.log')
    Wait-ForHealth 'http://127.0.0.1:8080' 90
    Write-Host 'Model is ready locally.'

    $tunnel = Start-Process -FilePath $cloudflared -ArgumentList 'tunnel --url http://127.0.0.1:8080' -WorkingDirectory $root -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot 'model-tunnel-out.log') -RedirectStandardError $tunnelLog
    $url = $null
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        if ($tunnel.HasExited) { throw 'cloudflared stopped before creating a tunnel.' }
        $log = Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue
        if ($log -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $url = $Matches[0]; break }
    }
    if (-not $url) { throw "Tunnel URL not received. Check $tunnelLog" }
    Wait-ForHealth $url 90
    Write-Host 'Checking authenticated, 40+ drawing batches through the public tunnel...'
    & $venvPython (Join-Path $PSScriptRoot 'benchmark.py') $url
    Assert-Success 'The tunnel inference benchmark failed. Worker was not updated.'

    if ($SmokeTest) {
        Write-Host 'Smoke test passed. No Worker was updated; closing temporary processes.'
        exit 0
    }

    Push-Location $worker
    try {
        # Wrangler reads stdin and trims trailing whitespace. Do not pass secrets in command arguments.
        $secret | & $wrangler secret put INFERENCE_SECRET
        Assert-Success 'Could not update INFERENCE_SECRET. Worker was not deployed.'
        $url | & $wrangler secret put INFERENCE_URL
        Assert-Success 'Could not update INFERENCE_URL. Worker was not deployed.'
        & npm run deploy
        Assert-Success 'Worker deployment failed. Check Wrangler output before starting a match.'
    } finally { Pop-Location }
    $workerReady = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $health = Invoke-RestMethod -Uri 'https://draw-it-right-match.farrellaxel2006.workers.dev/health' -Headers @{ 'X-Inference-Secret' = $secret } -TimeoutSec 7
            if ($health.ok -and $health.inferenceConfigured -and $health.inferenceReady) { $workerReady = $true; break }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if (-not $workerReady) { throw 'The deployed Worker could not authenticate its connection to this tunnel. Do not start a match.' }
    Remove-Item Env:INFERENCE_SECRET -ErrorAction SilentlyContinue
    Write-Host "Model is ONLINE through $url"
    Write-Host 'Vercel uses the game Worker URL already configured in the frontend. Keep this window open while anyone plays.'
    Write-Host 'Only one laptop should host this Worker at a time. Closing this window stops AI judging until the next start.'
    while (-not $server.HasExited -and -not $tunnel.HasExited) { Start-Sleep -Seconds 2 }
    throw 'The model server or tunnel stopped unexpectedly. Restart start-model.bat to publish a new URL.'
} finally {
    if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue }
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
    Remove-Item Env:INFERENCE_SECRET -ErrorAction SilentlyContinue
}
