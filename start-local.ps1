param(
  [int]$UiPort = 4300,
  [int]$ApiPort = 5000,
  [switch]$UseLocalData
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$uiDir = Join-Path $root "ui"
$apiDir = Join-Path $root "api\dataservices"
$logDir = Join-Path $root ".local-run"
$dataFile = Join-Path $apiDir "data\local-couponleo-data.json"
$snapshotWarmScript = Join-Path $apiDir "warm_couponleo_snapshot.py"

$python = (Get-Command python -ErrorAction Stop).Source
$npm = (Get-Command npm -ErrorAction Stop).Source

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Stop-ProjectProcessByPort {
  param(
    [int]$Port,
    [string[]]$PathHints = @()
  )

  $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listener) {
    return
  }

  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
  $commandLine = if ($proc) { $proc.CommandLine } else { "" }
  $matchesHint = $PathHints.Count -eq 0

  if (-not $matchesHint) {
    foreach ($hint in $PathHints) {
      if ($commandLine -like "*$hint*") {
        $matchesHint = $true
        break
      }
    }
  }

  if ($proc -and $matchesHint) {
    Stop-Process -Id $listener.OwningProcess -Force
    Start-Sleep -Seconds 2
  }
}

function Wait-Url {
  param(
    [string]$Url,
    [int]$Attempts = 25
  )

  for ($i = 0; $i -lt $Attempts; $i++) {
    try {
      Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 | Out-Null
      return $true
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  return $false
}

Stop-ProjectProcessByPort -Port $UiPort -PathHints @("couponleo_ultimate\ui", "vite.js", "serve-local.mjs")
Stop-ProjectProcessByPort -Port $ApiPort -PathHints @("couponleo_ultimate\api", "couponleo.py", "flask --app couponleo")

$apiOut = Join-Path $logDir "api.out.log"
$apiErr = Join-Path $logDir "api.err.log"
$uiOut = Join-Path $logDir "ui.out.log"
$uiErr = Join-Path $logDir "ui.err.log"
$snapshotOut = Join-Path $logDir "snapshot.out.log"
$snapshotErr = Join-Path $logDir "snapshot.err.log"

Remove-Item $apiOut, $apiErr, $uiOut, $uiErr -Force -ErrorAction SilentlyContinue

if (-not (Test-Path $dataFile) -and (Test-Path $snapshotWarmScript)) {
  Write-Host "No local CouponLeo snapshot found. Warming cache from the public API..."
  try {
    & $python -B $snapshotWarmScript --output $dataFile 1>> $snapshotOut 2>> $snapshotErr
  } catch {
    Write-Warning "Snapshot warm failed. The API may fall back to seed data. Check $snapshotOut and $snapshotErr."
  }
}

$apiEnvSegments = @(
  "set COUPONLEO_API_PORT=$ApiPort",
  "set COUPONLEO_API_DEBUG=false",
  "set ENABLE_MUTATIONS=true",
  "set ALLOWED_ORIGINS=http://127.0.0.1:$UiPort,http://localhost:$UiPort",
  "set ALLOWED_HOSTS=127.0.0.1,localhost",
  "set COUPONLEO_DATA_FILE=$dataFile"
)

$apiCommand = ($apiEnvSegments -join "&&") + "&&cd /d $apiDir&&""$python"" couponleo.py"

$apiProc = Start-Process `
  -FilePath "C:\Windows\System32\cmd.exe" `
  -ArgumentList "/c", $apiCommand `
  -WindowStyle Hidden `
  -RedirectStandardOutput $apiOut `
  -RedirectStandardError $apiErr `
  -PassThru

$uiProc = Start-Process `
  -FilePath "C:\Windows\System32\cmd.exe" `
  -ArgumentList "/c", "set PORT=$UiPort&&set HOST=127.0.0.1&&cd /d $uiDir&&""$npm"" run dev -- --host 127.0.0.1 --port $UiPort" `
  -WindowStyle Hidden `
  -RedirectStandardOutput $uiOut `
  -RedirectStandardError $uiErr `
  -PassThru

$apiReady = Wait-Url -Url "http://127.0.0.1:$ApiPort/couponleo/api/health"
$uiReady = Wait-Url -Url "http://127.0.0.1:$UiPort"

Write-Host ""
Write-Host "CouponLeo Ultimate started"
Write-Host "UI PID:  $($uiProc.Id)"
Write-Host "API PID: $($apiProc.Id)"
Write-Host "UI:  http://127.0.0.1:$UiPort"
Write-Host "API: http://127.0.0.1:$ApiPort/couponleo/api/health"
Write-Host "Logs: $logDir"
Write-Host ""

if (-not $apiReady) {
  Write-Warning "API did not become ready. Check $apiOut and $apiErr."
}

if (-not $uiReady) {
  Write-Warning "UI did not become ready. Check $uiOut and $uiErr."
}
