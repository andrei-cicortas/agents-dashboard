# Sets up Agents Dashboard on this PC: the Node packages, the parts the window
# is made of, and the shortcuts. Safe to run again at any time, for example
# after `git pull`.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1
#
# -NoShortcuts leaves the desktop and Start menu shortcuts as they are.

param(
  [switch]$NoShortcuts
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
# The WebView2 SDK the window was built and tested against.
$webView2Version = '1.0.4191.47'
$runtimeDownload = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703'

function Write-Step([string]$text) {
  Write-Host ''
  Write-Host "== $text" -ForegroundColor Cyan
}

function Write-Warn([string]$text) {
  Write-Host "   $text" -ForegroundColor Yellow
}

# ---- Node.js ---------------------------------------------------------------

Write-Step 'Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw 'Node.js is not installed. Install Node.js 24 or newer from https://nodejs.org, open a new terminal, and run this again.'
}
$nodeVersion = (& $node.Source --version).Trim()
if ([int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 24) {
  throw "Node.js $nodeVersion is too old. Install Node.js 24 or newer from https://nodejs.org, open a new terminal, and run this again."
}
Write-Host "   $nodeVersion"

# ---- Packages --------------------------------------------------------------

Write-Step 'Packages (npm install)'
Push-Location $root
try {
  # npm.cmd rather than npm: the npm.ps1 wrapper is blocked by the default
  # execution policy.
  & npm.cmd install --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed; the reason is in the messages above.' }
} finally {
  Pop-Location
}

# ---- WebView2 --------------------------------------------------------------

Write-Step 'Window parts (WebView2)'

$runtimeKeys = @(
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
  'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
  'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
)
$runtime = $runtimeKeys | ForEach-Object { (Get-ItemProperty $_ -ErrorAction SilentlyContinue).pv } |
  Where-Object { $_ -and $_ -ne '0.0.0.0' } | Select-Object -First 1
if ($runtime) {
  Write-Host "   WebView2 Runtime $runtime"
} else {
  Write-Warn "The WebView2 Runtime was not found. Windows 11 normally has it; if the window will not open, install it from $runtimeDownload"
}

$vendor = Join-Path $root 'vendor\webview2'
$marker = Join-Path $vendor 'version.txt'
if ((Test-Path $marker) -and (Get-Content -Raw $marker).Trim() -eq $webView2Version) {
  Write-Host "   SDK $webView2Version already in place"
} else {
  $temp = Join-Path ([IO.Path]::GetTempPath()) "agents-dashboard-webview2-$([guid]::NewGuid().ToString('N'))"
  New-Item -ItemType Directory -Force $temp | Out-Null
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $package = Join-Path $temp 'webview2.zip'
    Write-Host "   Downloading Microsoft.Web.WebView2 $webView2Version from nuget.org"
    Invoke-WebRequest -UseBasicParsing -Uri "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$webView2Version" -OutFile $package
    $extracted = Join-Path $temp 'package'
    Expand-Archive -Path $package -DestinationPath $extracted

    # Source inside the package -> folder under vendor\webview2.
    $parts = [ordered]@{
      'lib\net462\Microsoft.Web.WebView2.Core.dll' = ''
      'lib\net462\Microsoft.Web.WebView2.WinForms.dll' = ''
      'runtimes\win-x64\native\WebView2Loader.dll' = 'win-x64'
      'runtimes\win-arm64\native\WebView2Loader.dll' = 'win-arm64'
    }
    # Smart App Control only lets these load because Microsoft signed them, so
    # check that before they go anywhere.
    foreach ($source in $parts.Keys) {
      $file = Join-Path $extracted $source
      $signature = Get-AuthenticodeSignature -FilePath $file
      if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
        throw "$source in the WebView2 package is not signed by Microsoft ($($signature.Status)). Nothing was installed."
      }
    }
    foreach ($source in $parts.Keys) {
      $target = Join-Path $vendor $parts[$source]
      New-Item -ItemType Directory -Force $target | Out-Null
      Copy-Item -Force -Path (Join-Path $extracted $source) -Destination $target
    }
    Set-Content -Path $marker -Value $webView2Version
    Write-Host "   SDK $webView2Version installed in vendor\webview2"
  } finally {
    Remove-Item -Recurse -Force -Path $temp -ErrorAction SilentlyContinue
  }
}

# ---- Agents ----------------------------------------------------------------

Write-Step 'Agents'
if (Get-Command claude -ErrorAction SilentlyContinue) {
  Write-Host '   Claude Code found'
} else {
  Write-Warn 'Claude Code was not found. Install it (https://claude.com/claude-code), then run `claude` once to log in.'
}
if (Get-Command codex -ErrorAction SilentlyContinue) {
  Write-Host '   Codex found'
} else {
  Write-Host '   Codex not installed (optional: npm install -g @openai/codex)'
}

# ---- Shortcuts -------------------------------------------------------------

if (-not $NoShortcuts) {
  Write-Step 'Shortcuts'
  & (Join-Path $PSScriptRoot 'create-shortcut.ps1')
}

Write-Host ''
Write-Host 'Done. Open Agents Dashboard from the desktop or the Start menu.' -ForegroundColor Green
