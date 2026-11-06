# Fuentes externas, Fiscal, agregados/PIB y Laboratorio

_Incorporado el 2026-11-06. Todo lo de este documento es **solo dashboard**: nada se escribe en Google Sheets._

## Fuentes y cómo se leen

| Feed (`src/core/feeds.ts`) | Productor | Archivo | Frecuencia | Sección |
|---|---|---|---|---|
| `sspm.oyd_constantes` / `oyd_corrientes` / `oyd_desest` / `oyd_deflactores` | INDEC | CSV datos.gob.ar 4.2, 4.4, 3.2, 25.2 | Trimestral | Actividad (PIB, oferta y demanda) |
| `sspm.vab_constantes` / `vab_corrientes` | INDEC | CSV 6.2, 8.2 | Trimestral | Actividad (VAB por letra) |
| `sspm.supermercados` / `mayoristas` / `shoppings` | INDEC | CSV 455.1, 456.1, 458.1 | Mensual | Actividad (consumo) |
| `sspm.imig` | Secretaría de Hacienda | CSV 452.3 (IMIG) | Mensual | Fiscal |
| `sspm.aif` | Secretaría de Hacienda | CSV 379.9 (AIF, metodología 2017) | Mensual | Reservado (no usado aún) |
| `idecba.ipcba` | IDECBA | XLSX del banco de datos (URL resuelta por slug) | Mensual | Precios (IPCBA) |
| `idecba.restaurantes` | IDECBA | XLSX `EE_indice_actividad_restaurante` | Mensual | Actividad (restaurantes CABA) |
| Combustibles (`src/combustibles/`) | Secretaría de Energía | Res. 314/2016 (diaria) y Res. 1104/04 (mensual) | Diaria / mensual | Precios — ver [combustibles.md](combustibles.md) |

- **Por qué CSV y no la API JSON de Series de Tiempo:** la API devuelve vacías o atrasadas varias series que el CSV de distribución trae completas (p. ej. subsidios a la energía, exportaciones a precios corrientes, VAB salud) y el CSV suele tener un mes más. Los IDs de la API se conservan como `apiId` para trazabilidad.
- **Ingesta:** dentro de `npm run data:refresh` (después de la API INDEC). `-- --solo-externas` saltea INDEC; `-- --feed <id,...>` limita feeds. Misma normalización estricta, revisiones en `data/store/revisions.jsonl`, conservación del último dato válido (`stale`) y estado por feed en `manifest.feeds`.
- **IDECBA:** lector XLSX propio sin dependencias (`src/external/xlsx.ts`), validaciones de layout, títulos y variaciones publicadas (`src/external/idecba.ts`).
- **Sheets:** `sheetsSeriesByTopic` excluye series externas, sus derivadas y el tema Fiscal. Probado en `tests/ingest/external.test.ts`.

## Cuidados por serie

- **PIB y componentes:** niveles trimestrales **anualizados** (el anual es el promedio de 4 trimestres, no la suma). t/t solo sobre desestacionalizada. Discrepancia estadística: ceros previos a 2024-T1 → null. Shoppings: la metadata dice «miles», los valores están en millones.
- **IPCBA:** base 2021=100; nivel general empalmado desde 2012-07; 13 divisiones COICOP 2018 (no 1:1 con el IPC INDEC).
- **Restaurantes CABA:** índice de volumen (cubiertos), solo restaurantes tradicionales, sin desestacionalizar (usar i.a.), sin dato abr–oct 2020.

## Fiscal

- **Fuente:** IMIG base caja (Sector Público Nacional no financiero), metodología vigente de Hacienda: excluye rentas del BCRA y rentas del FGS por títulos del propio sector público; intereses netos de los intrasector público; intereses capitalizados no son gasto (criterio caja).
- **Subtotales:** sumas de partidas publicadas (`src/core/registry/fiscal.ts`). Columnas con cero estructural (combustibles desde 2020, desarrollo social, Fondo Federal Solidario, déficit operativo de empresas en el IMIG) quedan como auxiliares: entran en las sumas, no se muestran solas.
- **Identidades verificadas (129 meses, exactas):** ingresos totales − gasto primario = resultado primario; resultado primario − intereses = resultado financiero. Septiembre 2026: primario 1.427.640 y financiero 977.173 millones de $ (`tests/validation/fiscal-identities.test.ts`).
- **Valores reales («precios de hoy»):** `x × IPC(base) / IPC(t)` con IPC nacional nivel general del INDEC y base = último mes con IPC (`atConstantPrices` en `src/core/transforms.ts`). Sin IPC (antes de dic-2016 o meses sin publicar) → vacío.
- **Variaciones:** partidas → var. % i.a. nominal y real; resultados primario y financiero → **diferencia i.a. en niveles a precios de hoy** (no %). Mes o acumulado del año.

## Agregados monetarios como % del PIB (Monetario → Variables)

- **Oficial (línea continua):** promedio de los saldos diarios publicados en el trimestre ÷ PIB corriente promedio de los últimos 4 trimestres (PIB anual móvil) × 100. BM = serie BCRA 15; M1, M2, M3 = totales de cálculo propio.
- **Estimado (línea punteada):** trimestres posteriores al último PIB publicado: promedio de los saldos disponibles en ese trimestre ÷ último PIB anual móvil. El trimestre en curso es parcial y se marca. Se reemplaza al publicarse el PIB.
- Implementación: `src/web/lib/aggregatesGdp.ts`.

## Laboratorio (`/laboratorio`)

- Catálogo de todas las variables del monitor (registro INDEC + datos.gob.ar + IDECBA, BCRA y caución). **Combustibles excluido** por decisión del usuario. Cada serie se publica como JSON estático en `lab-data/<id>.json` y se descarga a demanda.
- Conversión de frecuencia solo hacia frecuencias más bajas (promedio, último o suma); mensual→trimestral/anual exige períodos completos; diaria→mensual usa lo publicado y marca el último período como posiblemente parcial.
- Precios constantes por IPC nacional convertido a la frecuencia elegida por promedio, base = último período.
- Transformaciones (núcleo de `src/core/transforms.ts` para M/Q/S/A): nivel, var. % vs período anterior, var. % i.a., diferencias, base 100, logaritmo, suma móvil 12 meses / 4 trimestres, acumulado del año. Escalas × 100, ÷ 1.000, ÷ 10⁶, ÷ 10⁹. Dos ejes, escala logarítmica por eje, línea / barras / área.
- Ratios y cálculos (A ÷ B, A × B, A − B, A + B, opcional × 100) sobre períodos comunes, después de convertir y deflactar y antes de transformar.
- La selección se guarda en el navegador del visitante (localStorage). Exporta CSV, PNG y SVG.

## Formato de fuente de todos los gráficos

`Fuente: one618 en base a <organismos>.` (p. ej. «INDEC», «Secretaría de Hacienda y INDEC», «BCRA y A3 Mercados»). Implementación: `sourceLineFor` en `src/web/lib/meta.ts`.
