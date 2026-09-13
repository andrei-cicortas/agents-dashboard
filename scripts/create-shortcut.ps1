# Creates (or replaces) the Agents Dashboard shortcuts on the desktop and in the
# Start menu. To put it on the taskbar: Start, right-click it, Pin to taskbar.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
if (-not ('AgentsDashboard.Shortcut' -as [type])) {
  Add-Type -TypeDefinition (Get-Content -Raw (Join-Path $root 'desktop\Shortcut.cs'))
}

$conhost = Join-Path $env:WINDIR 'System32\conhost.exe'
$powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
# conhost --headless runs PowerShell with no console window at all, which
# -WindowStyle Hidden stops promising once Windows Terminal is the default.
$arguments = "--headless `"$powershell`" -NoProfile -ExecutionPolicy Bypass -File `"$root\scripts\launch.ps1`""
$icon = Join-Path $root 'assets\icon.ico'

$folders = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('Programs')
)

foreach ($folder in $folders) {
  $path = Join-Path $folder 'Agents Dashboard.lnk'
  # The same AppUserModelID as the window, so a pinned icon and the open
  # window share one taskbar button.
  [AgentsDashboard.Shortcut]::Save($path, $conhost, $arguments, $root, $icon, 'Agents Dashboard', 'AgentsDashboard.App')
  Write-Output "Created $path"
}
