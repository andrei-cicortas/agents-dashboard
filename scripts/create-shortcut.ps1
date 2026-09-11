# Creates (or replaces) the "Agents Dashboard" shortcut on the desktop.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Agents Dashboard.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$root\scripts\launch.ps1`""
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$root\assets\icon.ico,0"
$shortcut.WindowStyle = 7
$shortcut.Description = 'Agents Dashboard'
$shortcut.Save()

Write-Output "Created $shortcutPath"
