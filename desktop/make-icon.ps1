# Draws build/icon.png (512x512): the app's git-branch mark on an orange rounded square.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$size = 512
$bitmap = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# Rounded square background.
$radius = 112
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0, 0, $radius, $radius, 180, 90)
$path.AddArc($size - $radius, 0, $radius, $radius, 270, 90)
$path.AddArc($size - $radius, $size - $radius, $radius, $radius, 0, 90)
$path.AddArc(0, $size - $radius, $radius, $radius, 90, 90)
$path.CloseFigure()
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(232, 73, 43))), $path)

# Same geometry as the favicon (24x24 viewBox), scaled into the square with padding.
$scale = 15.5
$offset = ($size - 24 * $scale) / 2
function P([double]$x, [double]$y) { New-Object System.Drawing.PointF ($offset + $x * $scale), ($offset + $y * $scale) }

$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), (2.4 * $scale)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$g.DrawLine($pen, (P 6 8.5), (P 6 15.5))
$g.DrawLine($pen, (P 8.3 7.2), (P 15.7 11))
foreach ($c in @(@(6, 6), @(6, 18), @(18, 12))) {
  $r = 2.5 * $scale
  $center = P $c[0] $c[1]
  $g.DrawEllipse($pen, $center.X - $r, $center.Y - $r, 2 * $r, 2 * $r)
}

$out = Join-Path $PSScriptRoot '..\build\icon.png'
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
$bitmap.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bitmap.Dispose()
Write-Output "Wrote $out"
