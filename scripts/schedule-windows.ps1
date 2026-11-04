<#
.SYNOPSIS
  Registra (o actualiza) la tarea diaria "MonitorMacroAR - Actualizacion" en el
  Programador de tareas de Windows. Idempotente: volver a ejecutarlo reemplaza la
  misma tarea, nunca crea duplicados.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/schedule-windows.ps1 -Time 08:30
  powershell -ExecutionPolicy Bypass -File scripts/schedule-windows.ps1 -Unregister
  powershell -ExecutionPolicy Bypass -File scripts/schedule-windows.ps1 -Status

.NOTES
  - La hora es la hora local del equipo. Verificá que la zona horaria de Windows sea
    "(UTC-03:00) Buenos Aires" (Argentina no aplica horario de verano).
  - LIMITACIÓN: la tarea solo corre si el equipo está encendido y con sesión iniciada
    (o con "ejecutar aunque el usuario no haya iniciado sesión", que pide contraseña).
    Con StartWhenAvailable, si el equipo estaba apagado a la hora pactada, corre al
    encender. Para actualización con el equipo apagado, ver docs/despliegue.md (GitHub Actions).
#>
param(
  [string]$Time = $(if ($env:REFRESH_DAILY_TIME) { $env:REFRESH_DAILY_TIME } else { '08:30' }),
  [switch]$Unregister,
  [switch]$Status
)
$TaskName = 'MonitorMacroAR - Actualizacion'
$root = Split-Path -Parent $PSScriptRoot

if ($Status) {
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $t) { Write-Output "La tarea '$TaskName' NO está registrada."; exit 0 }
  $i = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Output ("Tarea: {0}`nEstado: {1}`nÚltima ejecución: {2} (resultado {3})`nPróxima: {4}" -f $TaskName, $t.State, $i.LastRunTime, $i.LastTaskResult, $i.NextRunTime)
  exit 0
}

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "Tarea '$TaskName' eliminada (si existía)."
  exit 0
}

if ($Time -notmatch '^\d{2}:\d{2}$') { throw "Hora inválida: $Time (formato HH:MM)" }
$tz = (Get-TimeZone).Id
if ($tz -ne 'Argentina Standard Time') {
  Write-Warning "La zona horaria del equipo es '$tz', no Buenos Aires. La tarea correrá a las $Time hora local."
}

$script = Join-Path $root 'scripts\update.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 15)

# Register-ScheduledTask -Force reemplaza la definición existente: idempotente.
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Monitor macro Argentina: ingesta API INDEC + sincronización Google Sheets' -Force | Out-Null
Write-Output "Tarea '$TaskName' registrada: diaria a las $Time (hora local). Ver estado con -Status."
