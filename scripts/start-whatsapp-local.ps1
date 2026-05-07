$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendUrl = "http://127.0.0.1:3000/login.html"
$evolutionUrl = "http://localhost:8080"
$logPath = Join-Path $projectRoot "server-local.log"

function Test-Url {
  param([string] $Url)

  try {
    $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 4
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

Write-Output "Verificando Evolution API em $evolutionUrl..."

if (-not (Test-Url $evolutionUrl)) {
  Write-Output "ATENCAO: Evolution API nao respondeu em $evolutionUrl."
  Write-Output "Suba a Evolution primeiro. Se estiver via Docker, confira se o container esta ligado."
} else {
  Write-Output "OK: Evolution API respondeu."
}

Write-Output "Verificando backend em $backendUrl..."

if (Test-Url $backendUrl) {
  Write-Output "OK: backend ja esta rodando na porta 3000."
} else {
  Write-Output "Iniciando backend Node.js..."
  Start-Process -FilePath "node" `
    -ArgumentList "server.js" `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $logPath `
    -RedirectStandardError $logPath

  Start-Sleep -Seconds 4

  if (Test-Url $backendUrl) {
    Write-Output "OK: backend iniciado em http://127.0.0.1:3000."
  } else {
    Write-Output "FALHA: backend nao respondeu. Veja o log em $logPath."
    exit 1
  }
}

Write-Output ""
Write-Output "Rodando diagnostico do WhatsApp..."
npm run whatsapp:health
