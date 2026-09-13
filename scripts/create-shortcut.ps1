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
  # window share one taskbar button. The Start menu one is also what Windows
  # needs before it shows the app's notifications.
  [AgentsDashboard.Shortcut]::Save($path, $conhost, $arguments, $root, $icon, 'Agents Dashboard', 'AgentsDashboard.App')
  Write-Output "Created $path"
}

# agents-dashboard: links. A clicked Windows notification opens one, to bring
# the app forward on the thing it was about. Per user, so no admin rights.
function Set-RegistryDefault([string]$key, [string]$value) {
  if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
  Set-Item -Path $key -Value $value
}
$protocol = 'HKCU:\Software\Classes\agents-dashboard'
Set-RegistryDefault $protocol 'URL:Agents Dashboard'
New-ItemProperty -Path $protocol -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
Set-RegistryDefault "$protocol\DefaultIcon" "`"$icon`",0"
# Through open-link.ps1, which passes on nothing from the link but an id.
$linkArguments = "--headless `"$powershell`" -NoProfile -ExecutionPolicy Bypass -File `"$root\scripts\open-link.ps1`" `"%1`""
Set-RegistryDefault "$protocol\shell\open\command" "`"$conhost`" $linkArguments"
Write-Output 'Registered agents-dashboard: links'
