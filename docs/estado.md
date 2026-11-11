# Estado del proyecto

_Última actualización: 2026-11-06_

## Operativo y verificado contra servicios reales

| Componente | Estado |
|---|---|
| **Ingesta API INDEC** | 14 datasets. 142 series (137 de la API + 5 derivadas); 3 series del IPI minero incorporadas y verificadas el 2026-11-04. |
| **Google Sheets** | 4 documentos creados en Mi unidad (OAuth de usuario). Idempotencia, preservación de pestañas y gráficos manuales y propagación de revisiones verificadas en los documentos reales. |
| **Dashboard** | Sitio estático (`out/`) con datos reales; 7 secciones, incluida Monetario con tres pestañas; subruta y escaneo de secretos OK. Publicación mediante GitHub Pages. |
| **BCRA / Monetario** | 85 series oficiales, 440.224 observaciones reales; ingesta y catálogo independientes de Sheets. Incluye Otros198 y cálculos con componentes vigentes para resúmenes discontinuados en mayo. |
| **Validación** | Más de 50 cifras contrastadas con informes del INDEC y con variaciones publicadas por la API: coinciden dentro del redondeo. Hallazgos A1, A3, A4 y B2 corregidos; A2 documentado. Ver `docs/validacion.md`. |
| **Pruebas** | 663 pruebas aprobadas y 6 omitidas en CI (run 41902449530, 2026-11-04): core, ingest, monetary, sheets, web, validation; build estático y TypeScript OK. |

### Documentos de Google Sheets
Los 4 documentos (Actividad, Mercado laboral, Precios, Comercio exterior) están en Mi unidad del usuario. Sus IDs y links están en `config/sheets.local.json`, archivo local que no se publica.

### Dashboard publicado
https://imarinione618.github.io/monitor-macro/ (GitHub Pages, repositorio público `imarinione618/monitor-macro`).

### Ampliación monetaria — 2026-11-04

- Tres pestañas: Tasas; Depósitos y Préstamos; Variables Monetarias. Tarjetas monetarias en Resumen y estado BCRA en Fuentes.
- Frecuencia diaria/mensual, promedio/cierre, nominal/real ARS, base100, variaciones por calendario, ratios y composición con fechas comunes. Tasas en p.p./pb, sin convertir convenciones.
- Exportaciones CSV/PNG/SVG comparten datos visibles; PNG4800×2700 comprobado en navegador e inspeccionado visualmente, SVG probado mediante render real. Fondo blanco y convención/fuente incorporadas.
- Actualización independiente con caché, lock, conservación ante falla y revisiones históricas. Script Windows publica `data/store` y `data/monetary`; Sheets conserva únicamente su integración INDEC anterior. No se escribió en la planilla de referencia ni en otros Sheets durante esta ampliación.
- Pendientes: series992/893 y1494 con metadata inconsistente; composición pública USD y cuasimonedas2003/04. Los derivados y cortes incompletos están identificados.
- Ver [validación](monetario-validacion.md), [catálogo](monetario-catalogo.md), [metodología](monetario-metodologia.md), [instrumentos elegibles](monetario-instrumentos.md) y [auditoría de referencias](monetario-referencias.md).
- No se disparó la tarea diaria completa ampliada porque incluye escrituras Sheets preexistentes. Se verificaron por separado ingesta BCRA real, fallas/revisiones simuladas, sintaxis de scripts y build.

### Base monetaria + instrumentos con Repo BCRA (v2) — 2026-11-04

- Commits `e44fa24` (rótulo «Repo BCRA» para la serie 198 «Otros», selección de instrumentos simplificada) y `f3e644a` (Repo incluido en total y composición).
- Definición: 1248 + 1258 + 1260 + 1262 hasta el 14/07/2025; desde el 15/07/2025 se suma la 198. Antes de esa fecha Repo aporta cero por exclusión de cobertura, no por saldo observado. Detalle en [instrumentos elegibles](monetario-instrumentos.md).
- Último total con Repo: **48.892.144,28 millones ARS al 30/10/2026** (última fecha común de los componentes).
- Publicado y verificado en el sitio (`/monetario/` muestra Repo BCRA) el 2026-11-04 a las 17:02 (hora de Buenos Aires).
- **Incidente de publicación:** el run [41896612896](https://github.com/imarinione618/monitor-macro/actions/runs/41896612896) (`f3e644a`) falló dos veces en `deploy`: Pages quedó en `updating_pages` y `deploy-pages` cortó a los 10 min. El build y las pruebas estaban bien, el artefacto pesaba 8 MB (igual que antes) y GitHub no tenía incidentes declarados. Se resolvió con un run manual nuevo ([41902449530](https://github.com/imarinione618/monitor-macro/actions/runs/41902449530), `0e9b7a9`), que desplegó en 33 s. Procedimiento en [despliegue §4](despliegue.md#4-dashboard-publicado-github-pages).
- La copia duplicada `one618-logo-asset-management.svg` subida a la raíz en el commit `0e9b7a9` se borró; el sitio usa `public/one618-logo-asset-management.svg`.

Publicación inicial completada el 2026-11-04:
- Repositorio público creado y rama `main` sincronizada con GitHub.
- [Primer despliegue de GitHub Actions](https://github.com/imarinione618/monitor-macro/actions/runs/41866798897) finalizado correctamente: pruebas, exportación estática, escaneo y publicación.
- Verificación local: TypeScript sin errores y 608/608 pruebas aprobadas; build con `SITE_BASE_PATH=/monitor-macro`.
- Verificación del sitio público: las 6 rutas y los 17 recursos JS/CSS referenciados responden HTTP 200. No se realizó una nueva inspección visual interactiva (el navegador automatizado no estaba disponible).
- Los archivos versionados se comprobaron contra las credenciales locales y los IDs de Sheets: sin coincidencias. No se subieron secretos a GitHub.

### Fuentes externas, Fiscal, agregados/PIB y Laboratorio — 2026-11-06

- **Solo dashboard** (nada en Google Sheets). Detalle en [fuentes externas](fuentes-externas.md) y [combustibles](combustibles.md).
- **Actividad:** PIB (constante original y desestacionalizado, corriente, deflactor), oferta y demanda (constantes, corrientes, desestacionalizadas), VAB por letra (constante y corriente), hasta 2026-T2; supermercados, mayoristas y shoppings (índices y M$), hasta ago-2026; restaurantes CABA (IDECBA), hasta sep-2026. Fuente: CSV de datos.gob.ar (más completos que la API JSON) y XLSX del IDECBA.
- **Precios:** IPCBA (nivel general empalmado desde 2012-07, bienes/servicios, estacionales/regulados/resto, 13 divisiones), hasta oct-2026. Combustibles: mediana diaria en surtidor (Res. 314, desde 2018, hasta 02/11/2026) con quiebre de cobertura desde jul-2025 (YPF casi no informa) y promedio mensual ponderado por volumen (Res. 1104, desde 2016, hasta sep-2026).
- **Fiscal (sección nueva):** IMIG base caja, partidas y subtotales, nominal y a precios de hoy (IPC nacional); var. i.a. nominal y real por partida; resultados como diferencia i.a. en niveles reales. Identidades contables exactas en 129 meses; sep-2026 coincide con lo publicado.
- **Monetario:** BM, M1, M2 y M3 como % del PIB corriente (promedio trimestral ÷ PIB anual móvil) con línea punteada estimada para los trimestres posteriores al último PIB (hoy 2026-T3 completo y 2026-T4 en curso).
- **Laboratorio (pestaña nueva):** 409 variables (sin combustibles), conversión de frecuencia, deflactado por IPC, transformaciones, escalas, dos ejes, ratios y exportación.
- **Fuente de todos los gráficos:** «Fuente: one618 en base a …».
- **Actualización diaria:** `data:refresh` incluye las fuentes externas; se agregó `combustibles:refresh` a la tarea de Windows (`scripts/update.ps1`, código de salida 5 si falla), a `scripts/update.mjs`, al workflow opcional y al disparador de Pages (`data/combustibles/**`).
- Publicado (commit `12dc979`) y verificado en el sitio el 2026-11-06: las 7 rutas y los JSON del Laboratorio responden 200. El primer deploy cortó por timeout de Pages (`syncing_files`); un run manual nuevo desplegó bien. Ver [despliegue §4](despliegue.md#4-dashboard-publicado-github-pages).
- Validación: 1274 pruebas aprobadas, TypeScript y build estático con subruta OK; exportaciones de los gráficos nuevos inspeccionadas visualmente. Sitio comprimido ≈13 MB (la página Monetario ya pesaba ~25 MB de HTML antes de estos cambios).

### Caución A3 + gráfico Repo/caución/TAMAR — 2026-11-06

- Nueva fuente de mercado: tasa de caución a 1 día de **A3 Mercados** (índice I.CAUCION), desde el endpoint público que usa la función de Apps Script `TasaCaucion1DiaHistoricas`. 482 cierres diarios (07/11/2024 → 05/11/2026). Módulo `src/monetary/caucion.ts`; serie `monetario.a3.caucion` en `data/monetary`. Descarga completa en cada corrida, revisiones en `revisions.jsonl`, conservación ante falla. Se actualiza dentro de `npm run monetary:refresh` (tarea diaria incluida, sin cambios en scripts).
- Tasas → «Tasas pasivas, de mercado y de referencia»: caución agregada y seleccionada por defecto.
- Tasas → nuevo segundo gráfico «Repo BCRA, tasa de caución y TAMAR»: Repo 198 en área (eje izq., billones de ARS = millones ÷ 10⁶), caución y TAMAR en líneas (eje der., % TNA). Eje temporal: cada serie en sus propias fechas, sin completar días. Vista inicial: desde el 1/1 del año del último dato; CSV/PNG/SVG y tabla con el mismo modelo.
- Validación: 682 pruebas aprobadas (incluye las nuevas de caución y del gráfico combinado), TypeScript y build estático OK; exportación con datos reales inspeccionada visualmente. No se tocó Google Sheets.

## Actualización programada
- **Activa y verificada:** tarea de Windows "MonitorMacroAR - Actualizacion", diaria a las **12:00** (hora de Buenos Aires).
  - Hace ingesta, sincroniza Sheets y publica: commit y push de `data/store`, y GitHub Actions regenera el dashboard. La ingesta y Sheets se probaron con un disparo manual el 2026-11-04 a las 11:49: 13/13 datasets, 139/139 series, Sheets OK, resultado 0. La publicación se verificó por separado con el primer despliegue enlazado arriba.
  - La tarea apunta a la nueva carpeta local. Próxima ejecución confirmada al finalizar la publicación: 2026-11-05 a las 12:00.
  - Si un push falla, la siguiente corrida vuelve a intentar los commits pendientes aunque no haya datos nuevos. Los errores de preparación del commit no se ocultan con un push exitoso. Se verificaron 5 escenarios simulados de publicación y fallo sin modificar datos ni Sheets reales.
  - Log en `data/runs/update-AAAA-MM-DD.log`. Estado: `scripts/schedule-windows.ps1 -Status`.
  - **Solo corre con el equipo encendido.** Si estaba apagado a las 12:00, corre al encenderlo.
- **Incidente 2026-11-10/11:**
  - 10/11: la ingesta INDEC terminó con un crash nativo de Node (código -1073740791) al arrancar. Quedó un lock vencido, que la corrida siguiente reemplazó sola.
  - 11/11: la API respondió HTTP 503 PGRST002 (caché de esquema de PostgREST caída) con `Retry-After: 0`. El cliente tomaba ese 0 literal y agotaba los 4 reintentos en milisegundos.
    - Corregido: `Retry-After` ahora es un piso del backoff (`src/ingest/client.ts`, con test).
    - `scripts/update.ps1` reintenta la ingesta una vez a los 10 minutos si falla.
    - Ingesta manual el 11/11 por la tarde: 14/14 OK.
  - 11/11: Sheets devolvió `invalid_grant` en los 4 documentos. El refresh token de OAuth se creó el 04/11 y falló a los 7 días, lo que coincide con una app de OAuth en modo "Prueba" de Google Cloud. **Requiere `npm run sheets:auth`.** Para que no vuelva a vencer, publicar la app ("En producción") en la pantalla de consentimiento de OAuth.
- **Publicación tolerante a fallas (2026-11-11):**
  - Una ingesta fallida ya no frena el deploy de GitHub Pages. El test de invariantes solo avisa.
  - En el workflow, `scripts/check-freshness.ts` emite un `::warning::` por cada fuente con fallas.
  - El encabezado del dashboard muestra la última consulta exitosa **por fuente**: INDEC, datos.gob.ar, IDECBA, BCRA, A3 Mercados y Combustibles. Si el último intento falló, la fuente aparece en rojo con ⚠ (`src/web/server/freshness.ts`).
- **Lista para activar (no activa):** GitHub Actions (`deploy/github-actions/update.yml`) para actualizar con el equipo apagado. Ver `docs/despliegue.md`.

## Cambios del dashboard — 2026-11-04
- IPI minero incorporado en Actividad con sus tres ajustes; 116 meses por serie (ene-2017 a ago-2026), sin huecos ni nulos. Se incorpora a las próximas actualizaciones automáticas.
- Notas y enlaces metodológicos retirados del pie de los gráficos; las exportaciones tampoco incluyen notas. Se conserva la fuente y la documentación técnica en el repositorio.
- Cortes interanuales (incluidos acumulados interanuales): barras y valores de tabla positivos azules, negativos magenta, cero gris; el nivel general siempre gris. Misma regla en PNG/SVG.
- Logo SVG de one618 Asset Management en el encabezado de todas las páginas, enlazado al resumen, con adaptación al tema oscuro y a pantallas pequeñas. Servido desde `public/` respetando la subruta de GitHub Pages.
- Paleta violeta-rojo: prioridad a magenta `#E32D91`, azul `#1A4CC8` y gris `#969696`, también en exportaciones y minigráficos del resumen.
- Precios incorpora barras apiladas de contribución mensual estimada: núcleo azul, estacionales gris y regulados magenta. Fórmula confirmada por el usuario: `100 × peso × (IPCcategoría_t − IPCcategoría_t−1) / IPCgeneral_t−1` (p.p.).
- Pesos conservados exactamente (0,679236; 0,113209; 0,208047). Se informa que suman 1,000492 y que los aportes estimados pueden diferir de la inflación general; no se presentan como incidencias oficiales.
- Se calcula al generar el dashboard a partir de los índices existentes, con la función compartida de transformaciones. No requiere una nueva ingesta ni modifica los documentos de Sheets.
- Validación: 614 pruebas aprobadas; build estático con subruta y chequeo de tipos correctos; 15 verificaciones posteriores de exportación sin secretos y layout de Sheets aprobadas. Tabla de 24 meses, gráfico y colores comprobados en navegador local.

## Decisiones pendientes del usuario
1. **Actualización con el equipo apagado:** mover la ingesta y Sheets a GitHub Actions (`deploy/github-actions/update.yml`) si hace falta. Implica guardar el token del INDEC y el de Google como secrets del repositorio.
2. **Rubros de exportación:** integrar la serie mensual del ICA de datos.gob.ar (fuente INDEC, coincide exactamente con las planillas del INDEC) para tener PP/MOA/MOI/CyE con lo confidencial asignado.

## Ubicación
El proyecto vive en una carpeta local fuera de OneDrive desde el 2026-11-04. La carpeta anterior se conserva como respaldo y ya no se usa para las actualizaciones.

## Limitaciones conocidas
- **No disponibles:** ISAC, utilización de la capacidad instalada, índices de precios y cantidades de comercio, términos del intercambio. (PIB, demanda agregada y encuestas de comercio se toman de datos.gob.ar.)
- **SIPA y RIPTE:** son fuentes oficiales complementarias, no del INDEC, y no están integradas.
- **Rubros de exportación:** en la API no incluyen lo confidencial y difieren de los del informe ICA (A2).
- **Combustibles diarios:** desde jul-2025 la muestra excluye casi toda YPF (sube el nivel por composición); la regla de 90 días reduce la muestra en congelamientos de precios (2020, 2021-22). Ver [combustibles](combustibles.md).
- **Página Monetario:** ~25 MB de HTML por los datos diarios embebidos (preexistente); candidata a carga a demanda como el Laboratorio.
- **Socios comerciales:** las sumas por país subestiman el comercio por el secreto estadístico (`s`).
- **Fecha de publicación:** la API no la expone; las revisiones se detectan comparando corridas.
- **Tamaño de páginas:** el HTML de `/comercio` y `/actividad` pesa ~600 KB porque envía la historia completa.

## Próximos pasos sugeridos
- **Series disponibles todavía no incorporadas:** aperturas del IPI minero, tendencia-ciclo por bloque del IPI manufacturero, subsectores públicos de salarios (121/122), incidencias del IPC, hogares 1 y 3 de las canastas.
- **Fuentes complementarias:** SIPA y RIPTE (datos.gob.ar / MTEySS), como módulo separado.
- **Dashboard:** recortar del lado del servidor la historia enviada al navegador según el rango.
- **Pendientes de baja severidad de la validación:** B3, B4 y B5.
