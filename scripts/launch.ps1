# Starts the dashboard server if it is not running, then opens the app window.
# Run by the desktop shortcut through powershell.exe (signed, so Smart App
# Control allows it).

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$port = 4317
$url = "http://127.0.0.1:$port"
$dataDir = Join-Path $env:APPDATA 'agents-dashboard'
New-Item -ItemType Directory -Force $dataDir | Out-Null

function Show-Message([string]$text) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show($text, 'Agents Dashboard') | Out-Null
}

function Test-Dashboard {
  try {
    $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 2
    return ($health.app -eq 'agents-dashboard')
  } catch {
    return $false
  }
}

function Test-PortBusy {
  return $null -ne (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-Dashboard)) {
  if (Test-PortBusy) {
    Show-Message "Port $port is used by another program, so the dashboard cannot start. Close that program and try again."
    exit 1
  }

  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    Show-Message 'Node.js was not found. Install Node.js 24 or newer from https://nodejs.org and try again.'
    exit 1
  }

  Start-Process -FilePath $node.Source `
    -ArgumentList "`"$root\server\index.js`"" `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $dataDir 'server.log') `
    -RedirectStandardError (Join-Path $dataDir 'server-error.log')

  $deadline = (Get-Date).AddSeconds(15)
  while (-not (Test-Dashboard)) {
    if ((Get-Date) -gt $deadline) {
      Show-Message "The dashboard server did not start. Details are in $dataDir\server-error.log"
      exit 1
    }
    Start-Sleep -Milliseconds 300
  }
}

$edgeCandidates = @(
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
)
$edge = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) {
  Show-Message 'Microsoft Edge was not found. It is needed to show the dashboard window.'
  exit 1
}

Start-Process -FilePath $edge -ArgumentList "--app=$url", '--window-size=1600,950'
