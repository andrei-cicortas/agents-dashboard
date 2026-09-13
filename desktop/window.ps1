# The app window: a native Windows form showing the dashboard through WebView2.
#
# Every part it loads is signed by Microsoft (powershell.exe, .NET, WebView2),
# so it runs with Smart App Control on, where an Electron app would not.
# Started by scripts/launch.ps1, which makes sure the server is up and that
# only one window is open.

param(
  [Parameter(Mandatory = $true)] [string]$Url,
  [Parameter(Mandatory = $true)] [string]$DataDir,
  [Parameter(Mandatory = $true)] [string]$ProfileDir,
  # Set by a second launch to ask this window to come to the front.
  [System.Threading.EventWaitHandle]$Activate,
  # The notification to open once the page is up, when a click on a Windows
  # notification is what opened the app.
  [string]$OpenNotification = '',
  [int]$DebugPort = 0,
  [switch]$DevTools
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$appId = 'AgentsDashboard.App'
$vendor = Join-Path $root 'vendor\webview2'
$statePath = Join-Path $DataDir 'window.json'
$errorLog = Join-Path $DataDir 'window-error.log'
# Left here by a second launch for this window to pick up (see launch.ps1).
$openRequestPath = Join-Path $DataDir 'open-notification.txt'
$appOrigin = ([Uri]$Url).GetLeftPart([UriPartial]::Authority)

$coreDll = Join-Path $vendor 'Microsoft.Web.WebView2.Core.dll'
$winFormsDll = Join-Path $vendor 'Microsoft.Web.WebView2.WinForms.dll'
if (-not ((Test-Path $coreDll) -and (Test-Path $winFormsDll))) {
  throw "The window's WebView2 parts are missing. Run scripts\install.ps1 in the Agents Dashboard folder, then open the app again."
}

if (-not ('AgentsDashboard.Native' -as [type])) {
  Add-Type -TypeDefinition (Get-Content -Raw (Join-Path $PSScriptRoot 'Native.cs'))
}
# Both must happen before the first window exists.
[AgentsDashboard.Native]::SetAppId($appId)
[AgentsDashboard.Native]::UsePerMonitorDpi()

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -Path $coreDll
Add-Type -Path $winFormsDll
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'win-arm64' } else { 'win-x64' }
[Microsoft.Web.WebView2.Core.CoreWebView2Environment]::SetLoaderDllFolderPath((Join-Path $vendor $arch))
if ($DebugPort -gt 0) {
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$DebugPort"
}

[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::CatchException)

function Write-ErrorLog([string]$text) {
  try {
    Add-Content -Path $errorLog -Value "$(Get-Date -Format o) $text"
  } catch {
    # Nowhere left to report it.
  }
}

# A mistake in an event handler is logged rather than put in front of the user
# as a .NET crash dialog.
[System.Windows.Forms.Application]::add_ThreadException({
  param($s, $e)
  Write-ErrorLog "Window event failed: $($e.Exception)"
})

# ---- Addresses -------------------------------------------------------------

function ConvertTo-AbsoluteUri([string]$address) {
  $uri = $null
  if ([Uri]::TryCreate($address, [UriKind]::Absolute, [ref]$uri)) { return $uri }
  return $null
}

function Test-AppAddress([string]$address) {
  $uri = ConvertTo-AbsoluteUri $address
  return ($null -ne $uri) -and ($uri.GetLeftPart([UriPartial]::Authority) -eq $appOrigin)
}

# Links leave the app for the default browser, and only the kinds of address
# the page itself would ever make clickable.
function Open-Outside([string]$address) {
  $uri = ConvertTo-AbsoluteUri $address
  if ($null -eq $uri -or @('http', 'https', 'mailto') -notcontains $uri.Scheme) { return }
  try {
    Start-Process $uri.AbsoluteUri
  } catch {
    Write-ErrorLog "Could not open $($uri.AbsoluteUri): $_"
  }
}

# ---- Remembered place and colours ------------------------------------------

function ConvertTo-Rgb($hex) {
  if ($hex -isnot [string] -or $hex -notmatch '^#[0-9a-fA-F]{6}$') { return $null }
  return [Convert]::ToInt32($hex.Substring(1), 16)
}

function Read-WindowState {
  try {
    if (Test-Path $statePath) { return (Get-Content -Raw $statePath | ConvertFrom-Json) }
  } catch {
    Write-ErrorLog "Ignoring an unreadable window.json: $_"
  }
  return $null
}

function Test-OnScreen([System.Drawing.Rectangle]$rect) {
  foreach ($screen in [System.Windows.Forms.Screen]::AllScreens) {
    $overlap = [System.Drawing.Rectangle]::Intersect($screen.WorkingArea, $rect)
    if ($overlap.Width -ge 200 -and $overlap.Height -ge 100) { return $true }
  }
  return $false
}

$saved = Read-WindowState

# The colours of the last page shown, so the title bar starts out right instead
# of flashing white before the page has said what it looks like.
$chrome = @{ background = '#0a0a0a'; text = '#fafafa'; dark = $true }
if ($saved -and $saved.chrome -and ($null -ne (ConvertTo-Rgb $saved.chrome.background)) -and ($null -ne (ConvertTo-Rgb $saved.chrome.text))) {
  $chrome = @{ background = $saved.chrome.background; text = $saved.chrome.text; dark = [bool]$saved.chrome.dark }
}

# ---- The form --------------------------------------------------------------

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Agents Dashboard'
$form.Icon = New-Object System.Drawing.Icon (Join-Path $root 'assets\icon.ico')
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.MinimumSize = [System.Drawing.Size]::new(720, 480)
$form.BackColor = [System.Drawing.ColorTranslator]::FromHtml($chrome.background)

$work = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$width = [Math]::Min(1600, [int]($work.Width * 0.9))
$height = [Math]::Min(950, [int]($work.Height * 0.9))
$bounds = [System.Drawing.Rectangle]::new(
  $work.X + [int](($work.Width - $width) / 2),
  $work.Y + [int](($work.Height - $height) / 2),
  $width, $height)
if ($saved -and $saved.bounds) {
  try {
    $candidate = [System.Drawing.Rectangle]::new([int]$saved.bounds.x, [int]$saved.bounds.y, [int]$saved.bounds.width, [int]$saved.bounds.height)
    # A screen that has since been unplugged would leave the window nowhere.
    if ($candidate.Width -ge 720 -and $candidate.Height -ge 480 -and (Test-OnScreen $candidate)) { $bounds = $candidate }
  } catch {
    Write-ErrorLog "Ignoring saved window bounds: $_"
  }
}
$form.Bounds = $bounds
$wasMaximized = [bool]($saved -and $saved.maximized)
if ($wasMaximized) { $form.WindowState = [System.Windows.Forms.FormWindowState]::Maximized }

function Set-TitleBar {
  $caption = ConvertTo-Rgb $chrome.background
  $text = ConvertTo-Rgb $chrome.text
  if ($null -eq $caption -or $null -eq $text) { return }
  [AgentsDashboard.Native]::SetTitleBar($form.Handle, [bool]$chrome.dark, $caption, $text)
}

$webView = New-Object Microsoft.Web.WebView2.WinForms.WebView2
$webView.Dock = [System.Windows.Forms.DockStyle]::Fill
$webView.DefaultBackgroundColor = $form.BackColor
$creation = New-Object Microsoft.Web.WebView2.WinForms.CoreWebView2CreationProperties
$creation.UserDataFolder = $ProfileDir
$webView.CreationProperties = $creation
$form.Controls.Add($webView)

# Zoom, which a laptop screen often wants, kept between launches. The steps
# are the ones a browser uses.
$zoomSteps = @(0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0)
if ($saved -and $saved.zoom) {
  $savedZoom = [double]$saved.zoom
  if ($savedZoom -ge 0.5 -and $savedZoom -le 3) { $webView.ZoomFactor = $savedZoom }
}

function Step-Zoom([int]$step) {
  $current = $webView.ZoomFactor
  $next = switch ([Math]::Sign($step)) {
    1 { $zoomSteps | Where-Object { $_ -gt $current + 0.001 } | Select-Object -First 1 }
    -1 { $zoomSteps | Where-Object { $_ -lt $current - 0.001 } | Select-Object -Last 1 }
    default { 1.0 }
  }
  if ($next) { $webView.ZoomFactor = $next }
}

# ---- What the page asks of the window --------------------------------------

function Set-Chrome($message) {
  if ($null -eq (ConvertTo-Rgb $message.background) -or $null -eq (ConvertTo-Rgb $message.text)) { return }
  $script:chrome = @{ background = [string]$message.background; text = [string]$message.text; dark = [bool]$message.dark }
  $colour = [System.Drawing.ColorTranslator]::FromHtml($script:chrome.background)
  $form.BackColor = $colour
  $webView.DefaultBackgroundColor = $colour
  Set-TitleBar
}

# A Windows notification. Clicking it opens an agents-dashboard: link, which
# Windows hands to launch.ps1, which brings this window forward and has the
# page open what the notification was about.
function Show-Toast([string]$id, [string]$text) {
  if (-not $text) { return }
  try {
    $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    $null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
    $launch = if ($id -match '^[A-Za-z0-9-]{1,64}$') { "agents-dashboard:open?notification=$id" } else { 'agents-dashboard:open' }
    $body = [Security.SecurityElement]::Escape($text)
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml("<toast activationType=`"protocol`" launch=`"$launch`"><visual><binding template=`"ToastGeneric`"><text>$body</text></binding></visual></toast>")
    $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
  } catch {
    Write-ErrorLog "Could not show a Windows notification: $_"
  }
}

# Set once the page has loaded; a message posted before then is never heard.
$pageReady = $false

function Send-OpenNotification([string]$id) {
  if ($id -notmatch '^[A-Za-z0-9-]{1,64}$') { return }
  # Clicked while the page is still loading: it goes as soon as the page is up.
  if (-not $script:pageReady) {
    $script:OpenNotification = $id
    return
  }
  $webView.CoreWebView2.PostWebMessageAsJson((@{ type = 'open-notification'; id = $id } | ConvertTo-Json -Compress))
}

function Receive-PageMessage($e) {
  if (-not (Test-AppAddress $e.Source)) { return }
  try {
    $message = $e.WebMessageAsJson | ConvertFrom-Json
  } catch {
    return
  }
  switch ($message.type) {
    'window:theme' { Set-Chrome $message }
    'window:close' { $form.Close() }
    'window:zoom' { Step-Zoom ([int]$message.step) }
    'window:notify' {
      if (-not [AgentsDashboard.Native]::IsForeground($form.Handle)) {
        Show-Toast ([string]$message.id) ([string]$message.text)
      }
    }
    'window:attention' {
      if (-not [AgentsDashboard.Native]::IsForeground($form.Handle)) {
        [AgentsDashboard.Native]::FlashUntilFocused($form.Handle)
      }
    }
  }
}

# The browser's right-click menu offers Back, Print, Save as and Inspect, none
# of which mean anything here. Keep only what edits or copies text.
$menuItemsToKeep = @('cut', 'copy', 'paste', 'pasteAndMatchStyle', 'selectAll', 'undo', 'redo', 'emoji', 'copyLinkLocation')

function Limit-ContextMenu($e) {
  $items = $e.MenuItems
  $separator = [Microsoft.Web.WebView2.Core.CoreWebView2ContextMenuItemKind]::Separator
  $editable = $e.ContextMenuTarget.IsEditable
  for ($i = $items.Count - 1; $i -ge 0; $i--) {
    $item = $items[$i]
    # Spelling suggestions have no name of their own, only inside a text box.
    $keep = ($item.Kind -eq $separator) -or ($menuItemsToKeep -contains $item.Name) -or ($editable -and $item.Name -eq 'other')
    if (-not $keep) { $items.RemoveAt($i) }
  }
  for ($i = $items.Count - 1; $i -ge 0; $i--) {
    if ($items[$i].Kind -ne $separator) { continue }
    $atEdge = ($i -eq 0) -or ($i -eq $items.Count - 1)
    if ($atEdge -or $items[$i - 1].Kind -eq $separator) { $items.RemoveAt($i) }
  }
  if ($items.Count -eq 0) { $e.Handled = $true }
}

function Initialize-Page($core) {
  $settings = $core.Settings
  # Ctrl+F, Ctrl+N, Ctrl+P, F5 and the rest belong to the app, not a browser.
  $settings.AreBrowserAcceleratorKeysEnabled = $false
  $settings.IsStatusBarEnabled = $false
  $settings.IsSwipeNavigationEnabled = $false
  $settings.IsGeneralAutofillEnabled = $false
  $settings.IsPasswordAutosaveEnabled = $false
  $settings.AreDevToolsEnabled = [bool]($DevTools -or $DebugPort -gt 0)

  $core.add_NewWindowRequested({
    param($s, $e)
    $e.Handled = $true
    Open-Outside $e.Uri
  })
  $core.add_NavigationStarting({
    param($s, $e)
    if (Test-AppAddress $e.Uri) { return }
    $e.Cancel = $true
    Open-Outside $e.Uri
  })
  $core.add_DocumentTitleChanged({
    param($s, $e)
    $form.Text = $s.DocumentTitle
  })
  $core.add_WebMessageReceived({
    param($s, $e)
    Receive-PageMessage $e
  })
  $core.add_ContextMenuRequested({
    param($s, $e)
    Limit-ContextMenu $e
  })
  $core.add_NavigationCompleted({
    param($s, $e)
    if (-not $e.IsSuccess) { return }
    $script:pageReady = $true
    if ($script:OpenNotification) {
      $waiting = $script:OpenNotification
      $script:OpenNotification = ''
      Send-OpenNotification $waiting
    }
  })

  if ($DevTools) { $core.OpenDevToolsWindow() }
}

$webView.add_CoreWebView2InitializationCompleted({
  param($s, $e)
  if ($e.IsSuccess) {
    Initialize-Page $webView.CoreWebView2
    return
  }
  Write-ErrorLog "WebView2 did not start: $($e.InitializationException)"
  [System.Windows.Forms.MessageBox]::Show(
    "The window could not start its page engine (WebView2).`n`n$($e.InitializationException.Message)`n`nIf this keeps happening, install the WebView2 Runtime from https://go.microsoft.com/fwlink/p/?LinkId=2124703 and try again.",
    'Agents Dashboard') | Out-Null
  $form.Close()
})

# ---- Window behaviour ------------------------------------------------------

# A minimised window is not being looked at, so the page is told it is hidden:
# anything that answers meanwhile rings the bell, as for a window behind others.
$form.add_Resize({
  $minimized = $form.WindowState -eq [System.Windows.Forms.FormWindowState]::Minimized
  if (-not $minimized) { $script:wasMaximized = $form.WindowState -eq [System.Windows.Forms.FormWindowState]::Maximized }
  if ($webView.Visible -eq $minimized) { $webView.Visible = -not $minimized }
})

# Back from another window, the keys go straight to the page again.
$form.add_Activated({
  if ($webView.Visible) { $webView.Focus() | Out-Null }
})

$activateTimer = New-Object System.Windows.Forms.Timer
$activateTimer.Interval = 250
$activateTimer.add_Tick({
  if (-not $Activate.WaitOne(0)) { return }
  if (Test-Path $openRequestPath) {
    try {
      Send-OpenNotification ((Get-Content -Raw $openRequestPath).Trim())
      Remove-Item -Force $openRequestPath
    } catch {
      Write-ErrorLog "Could not open the clicked notification: $_"
    }
  }
  if ($form.WindowState -eq [System.Windows.Forms.FormWindowState]::Minimized) {
    $form.WindowState = if ($script:wasMaximized) { [System.Windows.Forms.FormWindowState]::Maximized } else { [System.Windows.Forms.FormWindowState]::Normal }
  }
  $form.Activate()
  if (-not [AgentsDashboard.Native]::BringToFront($form.Handle)) {
    # Windows can refuse a window the foreground; being topmost for a moment
    # still puts it above the others.
    $form.TopMost = $true
    $form.TopMost = $false
  }
})
if ($Activate) { $activateTimer.Start() }

$form.add_FormClosing({
  try {
    $placement = if ($form.WindowState -eq [System.Windows.Forms.FormWindowState]::Normal) { $form.Bounds } else { $form.RestoreBounds }
    $maximized = $form.WindowState -eq [System.Windows.Forms.FormWindowState]::Maximized -or
      ($form.WindowState -eq [System.Windows.Forms.FormWindowState]::Minimized -and $script:wasMaximized)
    [ordered]@{
      bounds = [ordered]@{ x = $placement.X; y = $placement.Y; width = $placement.Width; height = $placement.Height }
      maximized = [bool]$maximized
      zoom = [Math]::Round($webView.ZoomFactor, 3)
      chrome = $script:chrome
    } | ConvertTo-Json -Depth 4 | Set-Content -Path $statePath -Encoding UTF8
  } catch {
    Write-ErrorLog "Could not save window.json: $_"
  }
})

$form.add_Shown({
  $webView.Source = [Uri]$Url
})

$null = $form.Handle
[AgentsDashboard.Native]::ConsumeStartupShowState($form.Handle)
Set-TitleBar
[System.Windows.Forms.Application]::Run($form)
$activateTimer.Dispose()
$webView.Dispose()
