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
$catalogSummaryScript = Join-Path $apiDir "generate_catalog_summaries.py"

$python = (Get-Command python -ErrorAction Stop).Source
$node = (Get-Command node -ErrorAction Stop).Source
$npm = (Get-Command npm -ErrorAction Stop).Source

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Stop-ProjectProcessByPort {
  param(
    [int]$Port,
    [string[]]$PathHints = @(),
    [string[]]$FallbackProcessNames = @()
  )

  $listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  if (-not $listeners) {
    return
  }

  $stoppedAny = $false

  foreach ($processId in $listeners) {
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $proc) {
      continue
    }

    $commandLine = ""
    $executablePath = $proc.Path
    try {
      $cimProc = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction Stop
      $commandLine = $cimProc.CommandLine
      if ($cimProc.ExecutablePath) {
        $executablePath = $cimProc.ExecutablePath
      }
    } catch {
      # Fall back to exact-port process-name checks when command-line inspection is restricted.
    }
    $matchesHint = $PathHints.Count -eq 0

    if (-not $matchesHint) {
      foreach ($hint in $PathHints) {
        if ($commandLine -like "*$hint*" -or $executablePath -like "*$hint*") {
          $matchesHint = $true
          break
        }
      }
    }

    if (-not $matchesHint) {
      $normalizedProcessName = $proc.ProcessName.ToLowerInvariant()
      $matchesHint = $FallbackProcessNames | Where-Object { $_.ToLowerInvariant() -eq $normalizedProcessName }
      if (-not $matchesHint) {
        continue
      }
    }

    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      $stoppedAny = $true
    } catch {
      Write-Warning "Could not stop listener process $processId on port $Port."
    }
  }

  if ($stoppedAny) {
    Start-Sleep -Seconds 2
  }
}

function Stop-ProjectProcessesByCommandLine {
  param(
    [string[]]$Contains = @()
  )

  if ($Contains.Count -eq 0) {
    return
  }

  $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $commandLine = $_.CommandLine

    if (-not $commandLine) {
      return $false
    }

    foreach ($fragment in $Contains) {
      if ($commandLine -like "*$fragment*") {
        return $true
      }
    }

    return $false
  }

  foreach ($proc in $processes) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
    } catch {
      Write-Warning "Could not stop existing process $($proc.ProcessId)."
    }
  }

  if ($processes) {
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

Stop-ProjectProcessByPort -Port $UiPort -PathHints @("couponleo_ultimate\ui", "couponleonew_final\ui", "vite.js", "serve-local.mjs", "server/index.mjs") -FallbackProcessNames @("node")
Stop-ProjectProcessByPort -Port $ApiPort -PathHints @("couponleo_ultimate\api", "couponleo.py", "flask --app couponleo") -FallbackProcessNames @("python", "cmd")
Stop-ProjectProcessesByCommandLine -Contains @(
  "$uiDir\dist\analog\server\index.mjs",
  "$uiDir\node_modules\vite",
  "$uiDir"
)

$apiOut = Join-Path $logDir "api.out.log"
$apiErr = Join-Path $logDir "api.err.log"
$uiOut = Join-Path $logDir "ui-$UiPort.out.log"
$uiErr = Join-Path $logDir "ui-$UiPort.err.log"
$uiBuildOut = Join-Path $logDir "ui-build.out.log"
$uiBuildErr = Join-Path $logDir "ui-build.err.log"
$snapshotOut = Join-Path $logDir "snapshot.out.log"
$snapshotErr = Join-Path $logDir "snapshot.err.log"
$catalogSummaryOut = Join-Path $logDir "catalog-summaries.out.log"
$catalogSummaryErr = Join-Path $logDir "catalog-summaries.err.log"

Remove-Item $apiOut, $apiErr, $uiOut, $uiErr, $uiBuildOut, $uiBuildErr, $catalogSummaryOut, $catalogSummaryErr -Force -ErrorAction SilentlyContinue

if (-not (Test-Path $dataFile) -and (Test-Path $snapshotWarmScript)) {
  Write-Host "No local CouponLeo snapshot found. Warming cache from the public API..."
  try {
    & $python -B $snapshotWarmScript --output $dataFile 1>> $snapshotOut 2>> $snapshotErr
  } catch {
    Write-Warning "Snapshot warm failed. The API may fall back to seed data. Check $snapshotOut and $snapshotErr."
  }
}

if (Test-Path $catalogSummaryScript) {
  Write-Host "Refreshing CouponLeo catalog summaries for sitemap and SSR..."
  Push-Location $apiDir
  try {
    $env:COUPONLEO_DATA_FILE = $dataFile
    & $python -B $catalogSummaryScript 1>> $catalogSummaryOut 2>> $catalogSummaryErr
  } catch {
    Write-Warning "Catalog summary refresh failed. Existing summary JSON files will be used. Check $catalogSummaryOut and $catalogSummaryErr."
  } finally {
    Remove-Item Env:COUPONLEO_DATA_FILE -ErrorAction SilentlyContinue
    Pop-Location
  }
}

$apiEnvSegments = @(
  "set COUPONLEO_API_PORT=$ApiPort",
  "set COUPONLEO_API_DEBUG=false",
  "set COUPONLEO_TELEMETRY_ADMIN_KEY=couponleo-local-admin",
  "set ENABLE_MUTATIONS=true",
  "set ALLOWED_ORIGINS=http://127.0.0.1:$UiPort,http://localhost:$UiPort",
  "set ALLOWED_HOSTS=127.0.0.1,localhost",
  "set COUPONLEO_DATA_FILE=$dataFile"
)

if ($UseLocalData) {
  $apiEnvSegments += @(
    'set "COUPONLEO_DB_HOST= "',
    'set "CPLODB_HOST= "',
    'set "MYSQL_HOST= "',
    'set "DB_HOST= "',
    'set "host= "',
    'set "COUPONLEO_DB_USER= "',
    'set "CPLODB_USER= "',
    'set "MYSQL_USER= "',
    'set "DB_USER= "',
    'set "DB_USERNAME1= "',
    'set "COUPONLEO_DB_PASSWORD= "',
    'set "CPLODB_PASSWORD= "',
    'set "MYSQL_PASSWORD= "',
    'set "DB_PASSWORD1= "',
    'set "DB_PASSWORD= "',
    'set "DB_PASS= "',
    'set "COUPONLEO_DB_NAME= "',
    'set "CPLODB_NAME= "',
    'set "MYSQL_DB= "',
    'set "MYSQL_DATABASE= "',
    'set "DB_NAME= "',
    'set "database2= "',
    'set "COUPONLEO_DB_PORT= "',
    'set "CPLODB_PORT= "',
    'set "MYSQL_PORT= "',
    'set "DB_PORT= "',
    'set "port= "'
  )
}

$apiCommand = ($apiEnvSegments -join "&&") + "&&cd /d $apiDir&&""$python"" couponleo.py"

$apiProc = Start-Process `
  -FilePath "C:\Windows\System32\cmd.exe" `
  -ArgumentList "/c", $apiCommand `
  -WindowStyle Hidden `
  -RedirectStandardOutput $apiOut `
  -RedirectStandardError $apiErr `
  -PassThru

Write-Host "Building CouponLeo UI SSR bundle..."
Push-Location $uiDir
try {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & $npm run build *> $uiBuildOut
  $buildExitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $previousErrorActionPreference
  Pop-Location
}

if ($buildExitCode -ne 0) {
  throw "CouponLeo UI build failed. Check $uiBuildOut and $uiBuildErr."
}

$uiEnvSegments = @(
  "set PORT=$UiPort",
  "set NITRO_PORT=$UiPort",
  "set HOST=127.0.0.1"
)
$uiCommand = ($uiEnvSegments -join "&&") + "&&cd /d $uiDir&&""$node"" dist\analog\server\index.mjs"

$uiProc = Start-Process `
  -FilePath "C:\Windows\System32\cmd.exe" `
  -ArgumentList "/c", $uiCommand `
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
