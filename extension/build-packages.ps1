param(
  [string]$SourceDir = $PSScriptRoot,
  [string]$OutputDir = (Join-Path $PSScriptRoot 'dist')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$manifestSource = Join-Path $SourceDir 'manifest.json'
$manifestJson = Get-Content -LiteralPath $manifestSource -Raw
$sharedItems = @(
  'assets',
  'background.js',
  'content.js',
  'popup.css',
  'popup.html',
  'popup.js',
  'shared.js'
)

$targets = @(
  @{
    Name = 'chromium'
    StripBrowserSpecificSettings = $true
    Readme = @(
      'Use this package for Chrome or Microsoft Edge.',
      'Chrome: chrome://extensions -> Developer mode -> Load unpacked -> select this folder.',
      'Edge: edge://extensions -> Developer mode -> Load unpacked -> select this folder.'
    ) -join [Environment]::NewLine
  },
  @{
    Name = 'firefox'
    StripBrowserSpecificSettings = $false
    Readme = @(
      'Use this package for Firefox.',
      'Firefox: about:debugging#/runtime/this-firefox -> Load Temporary Add-on -> select manifest.json.'
    ) -join [Environment]::NewLine
  },
  @{
    Name = 'safari'
    StripBrowserSpecificSettings = $true
    Readme = @(
      'Use this package for Safari temporary testing or Safari packaging.',
      'Temporary install in macOS Safari: Safari -> Settings -> Developer -> Add Temporary Extension... -> select this folder.',
      'Package on macOS with Xcode: xcrun safari-web-extension-packager /path/to/dist/safari --copy-resources',
      'You can also upload the zipped contents of this folder to the Safari Web Extension Packager in App Store Connect.'
    ) -join [Environment]::NewLine
  }
)

function Write-TargetManifest {
  param(
    [string]$RawManifestJson,
    [bool]$StripBrowserSpecificSettings,
    [string]$DestinationPath
  )

  $manifest = $RawManifestJson | ConvertFrom-Json

  if ($StripBrowserSpecificSettings -and ($manifest.PSObject.Properties.Name -contains 'browser_specific_settings')) {
    $manifest.PSObject.Properties.Remove('browser_specific_settings')
  }

  $manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $DestinationPath -Encoding utf8
}

if (Test-Path -LiteralPath $OutputDir) {
  Remove-Item -LiteralPath $OutputDir -Recurse -Force
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

foreach ($target in $targets) {
  $targetDir = Join-Path $OutputDir $target.Name
  New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

  foreach ($item in $sharedItems) {
    $sourcePath = Join-Path $SourceDir $item
    $destinationPath = Join-Path $targetDir $item
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Recurse -Force
  }

  Write-TargetManifest -RawManifestJson $manifestJson -StripBrowserSpecificSettings $target.StripBrowserSpecificSettings -DestinationPath (Join-Path $targetDir 'manifest.json')
  Set-Content -LiteralPath (Join-Path $targetDir 'README.txt') -Value $target.Readme -Encoding utf8
}

Write-Host "Created browser packages in $OutputDir"
