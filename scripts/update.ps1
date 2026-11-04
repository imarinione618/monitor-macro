<#
.SYNOPSIS
  Actualización completa: ingesta INDEC -> store -> Google Sheets -> publicación del
  dashboard (push a GitHub). Pensado para el Programador de tareas de Windows
  (ver scripts/schedule-windows.ps1) o ejecución manual.

.DESCRIPTION
  - Ejecuta `npm run data:refresh` y, si terminó (aunque sea con fallas parciales,
    porque el store conserva el último dato válido), `npm run sheets:sync`.
  - Escribe un log por día en data/runs/update-AAAA-MM-DD.log (sin secretos).
  - El lock de la ingesta evita corridas simultáneas incompatibles.
  - Si el repositorio tiene remoto "origin", sube los cambios de data/store (commit +
    push); GitHub Actions regenera y publica el dashboard (.github/workflows/pages.yml).
    Desactivar con -SkipPublish o con la variable PUBLISH_GITHUB=0.
  - Código de salida: 0 OK, 1 falla de ingesta, 2 falla de Sheets, 3 falla de publicación.
#>
param(
  [switch]$SkipSheets,
  [switch]$SkipPublish,
  [switch]$Full
)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
New-Item -ItemType Directory -Force -Path (Join-Path $root 'data/runs') | Out-Null
$log = Join-Path $root ("data/runs/update-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))

function Log([string]$msg) {
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $log -Value $line -Encoding utf8
  Write-Output $line
}

Log "=== Inicio de actualización ==="
# La salida de npm se redirige vía cmd.exe para que el log quede en UTF-8 (Windows
# PowerShell 5 escribe "*>>" en UTF-16 y envuelve stderr como NativeCommandError).
$refreshCmd = 'npm.cmd run data:refresh' + $(if ($Full) { ' -- --full' } else { '' })
cmd.exe /d /c "$refreshCmd >> `"$log`" 2>&1"
$refreshCode = $LASTEXITCODE
Log "data:refresh terminó con código $refreshCode"

$sheetsCode = 0
if (-not $SkipSheets) {
  cmd.exe /d /c "npm.cmd run sheets:sync >> `"$log`" 2>&1"
  $sheetsCode = $LASTEXITCODE
  Log "sheets:sync terminó con código $sheetsCode"
}

$publishCode = 0
$hasOrigin = $false
cmd.exe /d /c "git remote get-url origin >nul 2>&1"
if ($LASTEXITCODE -eq 0) { $hasOrigin = $true }
if (-not $SkipPublish -and $env:PUBLISH_GITHUB -ne '0' -and $hasOrigin) {
  cmd.exe /d /c "git add data/store >> `"$log`" 2>&1"
  $publishCode = $LASTEXITCODE
  if ($publishCode -eq 0) {
    cmd.exe /d /c "git diff --cached --quiet -- data/store"
    $diffCode = $LASTEXITCODE
    if ($diffCode -eq 1) {
      $msg = "datos: actualización {0}" -f (Get-Date -Format 'yyyy-MM-dd')
      cmd.exe /d /c "git commit -m `"$msg`" -- data/store >> `"$log`" 2>&1"
      $publishCode = $LASTEXITCODE
    } elseif ($diffCode -ne 0) {
      $publishCode = $diffCode
    } else {
      Log "publicación: sin cambios nuevos en data/store"
    }
  }
  # Reintentar también commits pendientes de una corrida cuyo push haya fallado.
  if ($publishCode -eq 0) {
    cmd.exe /d /c "git push origin HEAD >> `"$log`" 2>&1"
    $publishCode = $LASTEXITCODE
    Log "publicación (git push) terminó con código $publishCode"
  } else {
    Log "publicación: no se pudo preparar el commit (código $publishCode)"
  }
} elseif (-not $hasOrigin) {
  Log "publicación: omitida (el repositorio no tiene remoto origin)"
}

if ($refreshCode -ne 0) { Log "=== Fin con fallas de ingesta (se conservaron los últimos datos válidos) ==="; exit 1 }
if ($sheetsCode -ne 0) { Log "=== Fin con fallas en Google Sheets ==="; exit 2 }
if ($publishCode -ne 0) { Log "=== Fin con falla al publicar en GitHub (datos y Sheets OK) ==="; exit 3 }
Log "=== Fin OK ==="
exit 0
