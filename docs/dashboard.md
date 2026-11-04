# Dashboard web

Next.js 15 (App Router) + React 19 + ECharts 5, publicado como **sitio estático**: `npm run build` lee el store normalizado (`src/core/store.ts`, `node:fs`) y genera HTML, JS y CSS en `out/`. El navegador no consulta la API del INDEC ni Google Sheets. Después de un `npm run data:refresh` hay que regenerar el sitio con `npm run build`; en `npm run dev` los datos se leen en cada recarga.

Publicación: GitHub Pages en https://imarinione618.github.io/monitor-macro/, con el workflow `.github/workflows/pages.yml`, que se dispara con cada push de `data/store` que hace la tarea diaria.

## Uso

```bash
npm run dev                          # store real (data/store)
DATA_MODE=fixtures npm run dev       # store sintético (data/store-fixtures) — banner de aviso
STORE_DIR=/ruta/a/otro/store npm run dev
npm run build && npm start           # sitio estático en out/ servido en http://localhost:3000
SITE_BASE_PATH=/monitor-macro npm run build   # build con subruta (lo hace el workflow de Pages)
```

`DATA_MODE` y `STORE_DIR` se leen al generar las páginas: en `dev`, en cada recarga; en `build`, una vez.

## Rutas

| Ruta | Contenido |
|---|---|
| `/` | Resumen: tarjetas de `headlineSeries()` (valor de `headline.transform`, unidad, período propio, comparación `headline.compare` o período anterior, sparkline, fecha de consulta, aviso de datos anteriores). |
| `/actividad` | EMAE nivel general (toggle original/desest./tendencia-ciclo), EMAE sectores (barras horizontales del mes elegido + evolución), IPI manufacturero (toggle), indicadores no disponibles. |
| `/laboral` | Salarios nominales por sector, salarios reales (nota de cálculo propio), EPH desocupación/subocupación y actividad/empleo (aviso "31 aglomerados urbanos — no es total nacional"), pobreza semestral, fuentes complementarias. |
| `/precios` | IPC nivel general por región, núcleo/regulados/estacionales, contribuciones mensuales estimadas (barras apiladas en p.p.), divisiones (corte del mes + evolución), mayoristas (SIPM), ICC (GBA), canastas en pesos. |
| `/comercio` | Tarjetas expo/impo/saldo, tabla mes / acumulado del año / 12 meses con var. i.a. (saldo: diferencia absoluta), expo e impo (transformaciones ytd y 12m), saldo en barras, expo por rubro e impo por uso (barras apiladas), socios (advertencia de supresión "s"). |
| `/fuentes` | Estado general (modo de datos, última corrida), estado por dataset (último éxito, último intento, error, filas, metodología), estado por serie (rango, cantidad, consulta, stale/error), revisiones recientes (`readRevisions`), no disponibles y fuentes complementarias del registro, signos convencionales, criterios. |

## Componentes (`src/web/`)

- `server/store.ts` — **solo servidor**. `getStoreState()` (ok / empty / error), `getClientSeries(id)`,
  `familyPool(family)`, `poolWithVariants(ids)`, `getRecentRevisions()`. Al cliente viaja `ClientSeries`
  (definición del registro + observaciones + `retrievedAt`, `stale`, `error`, `suppressedRows`, fuentes y URLs
  de metodología). Nunca URLs de consulta ni credenciales.
- `lib/` — lógica pura (testeada):
  - `chartModel.ts`: selector de transformaciones (`transformChoices`: solo habilita lo que `allowedTransforms`
    admite para **todas** las series y con unidad única; lo demás aparece deshabilitado con el motivo),
    compatibilidad de series (misma frecuencia y unidad resultante), variantes de ajuste estacional,
    rango (12m / 24m / 5 años / Todo), base 100 con período elegible, corte transversal. Usa
    `buildWideTable` de `src/core/views.ts`: mismos números que Sheets.
  - `chartOptions.ts`: opciones ECharts de pantalla y de exportación (1600×900, fondo blanco, título,
    subtítulo con transformación/unidad/ajuste/período/base, fuente y notas completas al pie, aviso de
    datos sintéticos, sin tooltip ni controles, sin animación).
  - `csv.ts`: UTF-8 con BOM, `;`, coma decimal, fecha ISO + período canónico, valores sin redondear, faltante vacío.
  - `format.ts`: es-AR (coma decimal), hora de Buenos Aires. `kpi.ts`: tarjetas, sparklines, resumen de comercio.
  - `meta.ts`: línea de fuente, notas, avisos por serie (stale, sin datos, error, supresión).
  - `palette.ts`: paleta violeta-rojo con prioridad a `#E32D91`, `#1A4CC8` y `#969696` (máx. 8 series; el color sigue a la serie). Se conserva en pantalla y exportaciones. En categorías del IPC: núcleo azul, estacionales gris y regulados magenta.
  - `exportRender.ts`: render fuera de pantalla — SVG (`renderer:'svg'`, también SSR en Node) y PNG
    (`renderer:'canvas'`, `pixelRatio` 3 → 4800×2700 px).
- `components/` — `ChartPanel` (gráfico reutilizable con selectores, tabla accesible alternable, CSV/PNG/SVG,
  fuente y notas), `SnapshotPanel` (barras horizontales del período elegido), `KpiCard`, `EChart`,
  `Nav`, `StateMessages` (banner sintético, store vacío/ilegible), `PageIntro`.

## Criterios de presentación

### Contribuciones del IPC

Se calculan con `ipcContribution` en `src/core/transforms.ts`, usando los niveles nacionales de cada categoría y del IPC general de igual base:

`aporte_t (p.p.) = 100 × peso × (IPCcategoría_t − IPCcategoría_t−1) / IPCgeneral_t−1`.

Pesos provistos y confirmados por el usuario: núcleo `0.679236`, estacionales `0.113209`, regulados `0.208047`. Se conservan sin normalizar (suma `1.000492`), por lo que el gráfico se identifica como estimación propia y su suma puede diferir de la inflación general. La [metodología INDEC N.º 32, sección 6](https://www.indec.gob.ar/ftp/cuadros/economia/metodologia_ipc_nacional_2019.pdf) explica el concepto de incidencia.

La comparación usa meses calendario: faltantes o denominador no positivo producen `null`, nunca cero. Los aportes negativos conservan su signo. El gráfico ofrece rango temporal, selección de categorías, tabla y CSV/PNG/SVG; usa azul para núcleo, gris para estacionales y magenta para regulados. Se genera desde el store existente y no agrega series a los documentos de Sheets.

### Criterios generales

- Sin doble eje. Líneas para series temporales; barras para saldo y composiciones (apiladas solo con
  magnitudes aditivas: nivel, acumulado, 12 meses; con % se pasa a líneas y se avisa).
- Sin rojo/verde como juicio: subas y bajas con el mismo color; el signo lo dan el número y el eje.
- Tooltip: período largo ("agosto 2026"), serie, valor es-AR y unidad. Tabla `<table>` con `caption`.
- Estados: carga (`loading.tsx`, "Cargando gráfico…"), store vacío (indica `npm run data:refresh`),
  error de lectura, datos conservados (`stale` → insignia en tarjeta/selector y aviso en el gráfico),
  banner fijo "DATOS SINTÉTICOS DE PRUEBA — NO SON DATOS REALES" si `manifest.dataMode === 'synthetic'`
  (también en el pie de las exportaciones).
- Responsive: sin scroll horizontal de página a 390 px; tablas con scroll propio; gráficos con `ResizeObserver`.
- Tema claro/oscuro según el sistema (la exportación siempre es blanca).

## Pruebas

`npx vitest run tests/web` — formateo, transformaciones válidas, modelo del gráfico, CSV, KPI, opciones de
exportación + render SSR a SVG (título, unidad, fuente, atributos bien formados). `EXPORT_SAMPLE_DIR=<dir>`
guarda SVG de ejemplo. `no-secrets.test.ts` recorre `.next/static/**` (requiere `npx next build`; si no existe
el build, se saltea) buscando `INDEC_API_TOKEN`, el valor del token de `.env`, `GOOGLE_OAUTH_CLIENT_SECRET`
(nombre y valor) y `Bearer `.
