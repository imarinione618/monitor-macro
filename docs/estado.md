# Estado del proyecto

_Última actualización: 2026-11-04_

## Operativo y verificado contra servicios reales

| Componente | Estado |
|---|---|
| **Ingesta API INDEC** | 13/13 datasets. 139 series verificadas con `data:check` (134 de la API + 5 derivadas). La 2.ª corrida no detecta cambios (idempotente). |
| **Google Sheets** | 4 documentos creados en Mi unidad (OAuth de usuario). Idempotencia, preservación de pestañas y gráficos manuales y propagación de revisiones verificadas en los documentos reales. |
| **Dashboard** | Sitio estático (`out/`) con datos reales; 6 rutas OK, también bajo subruta; escaneo de secretos OK. Publicado con GitHub Pages. |
| **Validación** | Más de 50 cifras contrastadas con informes del INDEC y con variaciones publicadas por la API: coinciden dentro del redondeo. Hallazgos A1, A3, A4 y B2 corregidos; A2 documentado. Ver `docs/validacion.md`. |
| **Pruebas** | 608 pruebas (core, ingest, sheets, web, validation). Instalación limpia verificada. |

### Documentos de Google Sheets
Los 4 documentos (Actividad, Mercado laboral, Precios, Comercio exterior) están en Mi unidad del usuario. Sus IDs y links están en `config/sheets.local.json`, archivo local que no se publica.

### Dashboard publicado
https://imarinione618.github.io/monitor-macro/ (GitHub Pages, repositorio público `imarinione618/monitor-macro`).

## Actualización programada
- **Activa y verificada:** tarea de Windows "MonitorMacroAR - Actualizacion", diaria a las **12:00** (hora de Buenos Aires).
  - Hace ingesta, sincroniza Sheets y publica: commit y push de `data/store`, y GitHub Actions regenera el dashboard. Se probó con un disparo manual el 2026-11-04 a las 11:49: 13/13 datasets, 139/139 series, Sheets OK, resultado 0.
  - Log en `data/runs/update-AAAA-MM-DD.log`. Estado: `scripts/schedule-windows.ps1 -Status`.
  - **Solo corre con el equipo encendido.** Si estaba apagado a las 12:00, corre al encenderlo.
- **Lista para activar (no activa):** GitHub Actions (`deploy/github-actions/update.yml`) para actualizar con el equipo apagado. Ver `docs/despliegue.md`.

## Decisiones pendientes del usuario
1. **Actualización con el equipo apagado:** mover la ingesta y Sheets a GitHub Actions (`deploy/github-actions/update.yml`) si hace falta. Implica guardar el token del INDEC y el de Google como secrets del repositorio.
2. **Rubros de exportación:** integrar la serie mensual del ICA de datos.gob.ar (fuente INDEC, coincide exactamente con las planillas del INDEC) para tener PP/MOA/MOI/CyE con lo confidencial asignado.

## Ubicación
El proyecto vive en una carpeta local fuera de OneDrive desde el 2026-11-04. La carpeta anterior se conserva como respaldo y ya no se usa para las actualizaciones.

## Limitaciones conocidas
- **No disponibles en la API de INDEC:** PIB trimestral y demanda agregada, ISAC, utilización de la capacidad instalada, supermercados, mayoristas y shoppings, índices de precios y cantidades de comercio, términos del intercambio.
- **SIPA y RIPTE:** son fuentes oficiales complementarias, no del INDEC, y no están integradas.
- **Rubros de exportación:** en la API no incluyen lo confidencial y difieren de los del informe ICA (A2).
- **Socios comerciales:** las sumas por país subestiman el comercio por el secreto estadístico (`s`).
- **Fecha de publicación:** la API no la expone; las revisiones se detectan comparando corridas.
- **Tamaño de páginas:** el HTML de `/comercio` y `/actividad` pesa ~600 KB porque envía la historia completa.

## Próximos pasos sugeridos
- **Series disponibles todavía no incorporadas:** IPI minero, tendencia-ciclo por bloque del IPI, subsectores públicos de salarios (121/122), incidencias del IPC, hogares 1 y 3 de las canastas.
- **Fuentes complementarias:** SIPA y RIPTE (datos.gob.ar / MTEySS), como módulo separado.
- **Dashboard:** recortar del lado del servidor la historia enviada al navegador según el rango.
- **Pendientes de baja severidad de la validación:** B3, B4 y B5.
