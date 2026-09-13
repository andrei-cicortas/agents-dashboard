# Opens Agents Dashboard. Starts the server when it is not running, then either
# brings the window that is already open to the front or opens the app window
# (desktop\window.ps1).
#
# The shortcuts run this through `conhost.exe --headless powershell.exe`, so no
# console window appears. Everything involved is signed, which is what Smart
# App Control asks for.

param(
  [int]$Port = 4317,
  [string]$DataDir = (Join-Path $env:APPDATA 'agents-dashboard'),
  [string]$ProfileDir = (Join-Path $env:LOCALAPPDATA 'agents-dashboard\webview'),
  # An agents-dashboard: link, from a clicked Windows notification.
  [string]$Open = '',
  # For development: open DevTools with the window, or let a debugger attach.
  [switch]$DevTools,
  [int]$DebugPort = 0
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$url = "http://127.0.0.1:$Port"
New-Item -ItemType Directory -Force $DataDir | Out-Null
$errorLog = Join-Path $DataDir 'window-error.log'

function Show-Message([string]$text) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($text, 'Agents Dashboard') | Out-Null
}

# Nobody can see this script, so whatever stops it is shown and logged.
trap {
  $details = $_ | Out-String
  try { Add-Content -Path $errorLog -Value "$(Get-Date -Format o) $details" } catch { }
  Show-Message "Agents Dashboard could not open.`n`n$($_.Exception.Message)`n`nDetails are in $errorLog"
  exit 1
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
  return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

# ---- The server ------------------------------------------------------------

# Checked before anything else, even when a window is already open: a window
# whose server has stopped would otherwise only ever be brought to the front,
# and sit there reconnecting to nothing. Once the server is back, that window
# reconnects on its own.
if (-not (Test-Dashboard)) {
  if (Test-PortBusy) {
    Show-Message "Port $Port is used by another program, so the dashboard cannot start. Close that program and try again."
    exit 1
  }

  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    Show-Message 'Node.js was not found. Install Node.js 24 or newer from https://nodejs.org and try again.'
    exit 1
  }

  # The server keeps its state beside the window's, so a trial run with its
  # own -DataDir can never write over the real state.
  $env:DASHBOARD_SERVER_PORT = [string]$Port
  $env:DASHBOARD_STATE_FILE = Join-Path $DataDir 'state.json'
  Start-Process -FilePath $node.Source `
    -ArgumentList "`"$root\server\index.js`"" `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $DataDir 'server.log') `
    -RedirectStandardError (Join-Path $DataDir 'server-error.log')

  $deadline = (Get-Date).AddSeconds(15)
  while (-not (Test-Dashboard)) {
    if ((Get-Date) -gt $deadline) {
      Show-Message "The dashboard server did not start. Details are in $DataDir\server-error.log"
      exit 1
    }
    Start-Sleep -Milliseconds 300
  }
}

# ---- One window ------------------------------------------------------------

# Only ever an id: the link comes from outside, so nothing else of it is used.
$notificationId = if ($Open -match 'notification=([A-Za-z0-9-]{1,64})') { $Matches[1] } else { '' }

$windowMutex = [System.Threading.Mutex]::new($false, "Local\AgentsDashboard.Window.$Port")
$activate = [System.Threading.EventWaitHandle]::new($false, [System.Threading.EventResetMode]::AutoReset, "Local\AgentsDashboard.Activate.$Port")
try {
  $ownsWindow = $windowMutex.WaitOne(0)
} catch [System.Threading.AbandonedMutexException] {
  # The last window ended without letting go, which makes it ours now.
  $ownsWindow = $true
}
if (-not $ownsWindow) {
  if ($notificationId) { Set-Content -Path (Join-Path $DataDir 'open-notification.txt') -Value $notificationId }
  Add-Type -TypeDefinition (Get-Content -Raw (Join-Path $root 'desktop\Native.cs'))
  [AgentsDashboard.Native]::AllowAnyForeground()
  $activate.Set() | Out-Null
  exit 0
}

# ---- The window ------------------------------------------------------------

& (Join-Path $root 'desktop\window.ps1') -Url $url -DataDir $DataDir -ProfileDir $ProfileDir `
  -Activate $activate -OpenNotification $notificationId -DebugPort $DebugPort -DevTools:$DevTools
$windowMutex.ReleaseMutex()
