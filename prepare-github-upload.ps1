$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$destination = Join-Path $projectRoot "_github-upload-$timestamp"

New-Item -ItemType Directory -Path $destination | Out-Null

$excludeDirectories = @(
  "node_modules",
  ".git"
)

$excludeFiles = @(
  ".env",
  "serviceAccountKey.json"
)

Get-ChildItem -LiteralPath $projectRoot -Force | ForEach-Object {
  if ($_.Name -like "_github-upload-*") {
    return
  }

  if ($excludeDirectories -contains $_.Name) {
    return
  }

  if (-not $_.PSIsContainer -and $excludeFiles -contains $_.Name) {
    return
  }

  $targetPath = Join-Path $destination $_.Name

  if ($_.PSIsContainer) {
    Copy-Item -LiteralPath $_.FullName -Destination $targetPath -Recurse
    Get-ChildItem -LiteralPath $targetPath -Recurse -Force -File |
      Where-Object { $_.Name -in $excludeFiles } |
      Remove-Item -Force
  } else {
    Copy-Item -LiteralPath $_.FullName -Destination $targetPath
  }
}

Write-Output "Pacote pronto para upload em: $destination"
