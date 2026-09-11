# Generates assets/icon.ico: a dark rounded tile with a 2x2 grid of panels,
# the first one in the brand color. The ICO holds one 256x256 PNG image.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'assets'
New-Item -ItemType Directory -Force $assets | Out-Null

$size = 256
$bitmap = New-Object System.Drawing.Bitmap $size, $size
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

$tileBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 17, 17, 19))
$graphics.FillPath($tileBrush, (New-RoundedRect 0 0 $size $size 48))

$padding = 48
$gap = 16
$cell = ($size - 2 * $padding - $gap) / 2
$panelBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 58, 58, 66))
$brandBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 245, 165, 36))
for ($row = 0; $row -lt 2; $row++) {
  for ($col = 0; $col -lt 2; $col++) {
    $x = $padding + $col * ($cell + $gap)
    $y = $padding + $row * ($cell + $gap)
    $brush = if ($row -eq 0 -and $col -eq 0) { $brandBrush } else { $panelBrush }
    $graphics.FillPath($brush, (New-RoundedRect $x $y $cell $cell 12))
  }
}
$graphics.Dispose()

$png = New-Object System.IO.MemoryStream
$bitmap.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
$bytes = $png.ToArray()

$iconPath = Join-Path $assets 'icon.ico'
$stream = [System.IO.File]::Create($iconPath)
$writer = New-Object System.IO.BinaryWriter $stream
$writer.Write([UInt16]0)              # reserved
$writer.Write([UInt16]1)              # type: icon
$writer.Write([UInt16]1)              # image count
$writer.Write([Byte]0)                # width 256 is stored as 0
$writer.Write([Byte]0)                # height 256 is stored as 0
$writer.Write([Byte]0)                # palette colors
$writer.Write([Byte]0)                # reserved
$writer.Write([UInt16]1)              # color planes
$writer.Write([UInt16]32)             # bits per pixel
$writer.Write([UInt32]$bytes.Length)  # image size
$writer.Write([UInt32]22)             # image offset (6 + 16)
$writer.Write($bytes)
$writer.Dispose()

Write-Output "Wrote $iconPath"
