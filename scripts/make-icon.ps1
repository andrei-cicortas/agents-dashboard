# Generates assets/icon.ico: a dark rounded tile with a 2x2 grid of panels,
# the first one in the brand color.
#
# Every size Windows asks for is drawn on its own pixel grid rather than shrunk
# from the big one, so the 16 and 24 pixel icons on the title bar and taskbar
# stay sharp. The small sizes are stored as plain bitmaps, which every reader
# of .ico files understands; the 256 pixel one as PNG, which keeps the file small.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'assets'
New-Item -ItemType Directory -Force $assets | Out-Null

$sizes = @(16, 20, 24, 32, 40, 48, 64, 256)

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  if ($r -lt 1) {
    $path.AddRectangle([System.Drawing.RectangleF]::new($x, $y, $w, $h))
    return $path
  }
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-IconBitmap([int]$size) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $scale = $size / 256
  $tileBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 17, 17, 19))
  $graphics.FillPath($tileBrush, (New-RoundedRect 0 0 $size $size ([Math]::Max(2, 48 * $scale))))

  # Whole pixels for the grid, centred again after rounding.
  $padding = [Math]::Round(48 * $scale)
  $gap = [Math]::Max(1, [Math]::Round(16 * $scale))
  $cell = [Math]::Floor(($size - 2 * $padding - $gap) / 2)
  $offset = [Math]::Floor(($size - (2 * $cell + $gap)) / 2)
  $radius = 12 * $scale

  $panelBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 58, 58, 66))
  $brandBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 245, 165, 36))
  for ($row = 0; $row -lt 2; $row++) {
    for ($col = 0; $col -lt 2; $col++) {
      $x = $offset + $col * ($cell + $gap)
      $y = $offset + $row * ($cell + $gap)
      $brush = if ($row -eq 0 -and $col -eq 0) { $brandBrush } else { $panelBrush }
      $graphics.FillPath($brush, (New-RoundedRect $x $y $cell $cell $radius))
    }
  }
  $graphics.Dispose()
  return $bitmap
}

# A 32-bit bitmap as an .ico stores it: the header says twice the height, the
# rows run bottom to top, and an all-zero mask follows (the alpha does the work).
function Get-BitmapEntry([System.Drawing.Bitmap]$bitmap) {
  $size = $bitmap.Width
  $stream = New-Object System.IO.MemoryStream
  $writer = New-Object System.IO.BinaryWriter $stream
  $writer.Write([UInt32]40)
  $writer.Write([Int32]$size)
  $writer.Write([Int32]($size * 2))
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]0)
  $writer.Write([UInt32]0)
  $writer.Write([Int32]0)
  $writer.Write([Int32]0)
  $writer.Write([UInt32]0)
  $writer.Write([UInt32]0)
  for ($y = $size - 1; $y -ge 0; $y--) {
    for ($x = 0; $x -lt $size; $x++) {
      $pixel = $bitmap.GetPixel($x, $y)
      $writer.Write([byte]$pixel.B)
      $writer.Write([byte]$pixel.G)
      $writer.Write([byte]$pixel.R)
      $writer.Write([byte]$pixel.A)
    }
  }
  $maskRow = [Math]::Floor(($size + 31) / 32) * 4
  $writer.Write((New-Object byte[] ($maskRow * $size)))
  $writer.Flush()
  # The comma keeps PowerShell from unrolling the array into loose bytes.
  return , $stream.ToArray()
}

function Get-PngEntry([System.Drawing.Bitmap]$bitmap) {
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  return , $stream.ToArray()
}

$images = foreach ($size in $sizes) {
  $bitmap = New-IconBitmap $size
  $bytes = if ($size -ge 256) { Get-PngEntry $bitmap } else { Get-BitmapEntry $bitmap }
  $bitmap.Dispose()
  , @{ Size = $size; Bytes = $bytes }
}

$iconPath = Join-Path $assets 'icon.ico'
$stream = [System.IO.File]::Create($iconPath)
$writer = New-Object System.IO.BinaryWriter $stream
$writer.Write([UInt16]0)               # reserved
$writer.Write([UInt16]1)               # type: icon
$writer.Write([UInt16]$images.Count)   # image count
$offset = 6 + 16 * $images.Count
foreach ($image in $images) {
  $dimension = if ($image.Size -ge 256) { 0 } else { $image.Size }  # 256 is stored as 0
  $writer.Write([Byte]$dimension)      # width
  $writer.Write([Byte]$dimension)      # height
  $writer.Write([Byte]0)               # palette colors
  $writer.Write([Byte]0)               # reserved
  $writer.Write([UInt16]1)             # color planes
  $writer.Write([UInt16]32)            # bits per pixel
  $writer.Write([UInt32]$image.Bytes.Length)
  $writer.Write([UInt32]$offset)
  $offset += $image.Bytes.Length
}
foreach ($image in $images) {
  $writer.Write([byte[]]$image.Bytes)
}
$writer.Dispose()

Write-Output "Wrote $iconPath ($($sizes -join ', ') px)"
