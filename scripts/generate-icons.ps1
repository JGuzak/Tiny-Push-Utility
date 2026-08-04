param(
  [string]$SourcePath = "images\push-diagram-empty.png",
  [string]$PngPath = "images\icon-256.png",
  [string]$IcoPath = "images\icon.ico"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resolvedSourcePath = Join-Path $root $SourcePath
$resolvedPngPath = Join-Path $root $PngPath
$resolvedIcoPath = Join-Path $root $IcoPath
$sizes = @(256, 128, 64, 48, 32, 16)

function New-ThumbnailPngBytes {
  param(
    [Parameter(Mandatory = $true)]
    [System.Drawing.Image]$Source,
    [Parameter(Mandatory = $true)]
    [int]$Size
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $padding = [Math]::Max(2, [int][Math]::Round($Size * 0.08))
    $maxWidth = $Size - (2 * $padding)
    $maxHeight = $Size - (2 * $padding)
    $scale = [Math]::Min($maxWidth / $Source.Width, $maxHeight / $Source.Height)
    $drawWidth = [int][Math]::Round($Source.Width * $scale)
    $drawHeight = [int][Math]::Round($Source.Height * $scale)
    $x = [int][Math]::Round(($Size - $drawWidth) / 2)
    $y = [int][Math]::Round(($Size - $drawHeight) / 2)

    $graphics.DrawImage($Source, $x, $y, $drawWidth, $drawHeight)
  } finally {
    $graphics.Dispose()
  }

  $stream = New-Object System.IO.MemoryStream

  try {
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    return ,([byte[]]$stream.ToArray())
  } finally {
    $stream.Dispose()
    $bitmap.Dispose()
  }
}

$source = [System.Drawing.Image]::FromFile($resolvedSourcePath)

try {
  $entries = New-Object System.Collections.Generic.List[object]

  foreach ($size in $sizes) {
    [void]$entries.Add([pscustomobject]@{
      Size = $size
      Bytes = [byte[]](New-ThumbnailPngBytes -Source $source -Size $size)
    })
  }

  [System.IO.File]::WriteAllBytes($resolvedPngPath, [byte[]]$entries[0].Bytes)

  $ico = New-Object System.IO.MemoryStream
  $writer = New-Object System.IO.BinaryWriter($ico)

  try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$entries.Count)

    $offset = 6 + (16 * $entries.Count)

    foreach ($entry in $entries) {
      $dimensionByte = if ($entry.Size -eq 256) { [byte]0 } else { [byte]$entry.Size }

      $writer.Write($dimensionByte)
      $writer.Write($dimensionByte)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]32)
      $writer.Write([UInt32]$entry.Bytes.Length)
      $writer.Write([UInt32]$offset)

      $offset += $entry.Bytes.Length
    }

    foreach ($entry in $entries) {
      $writer.Write([byte[]]$entry.Bytes)
    }

    $writer.Flush()
    [System.IO.File]::WriteAllBytes($resolvedIcoPath, [byte[]]$ico.ToArray())
  } finally {
    $writer.Dispose()
    $ico.Dispose()
  }
} finally {
  $source.Dispose()
}

Write-Output "Generated $PngPath and $IcoPath from $SourcePath."
