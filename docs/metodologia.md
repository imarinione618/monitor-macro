# Metodología y convenciones de datos

Este documento explica cómo se almacenan, transforman y presentan los datos. La implementación de referencia está en `src/core/transforms.ts`, que es **la única** implementación: Google Sheets y el dashboard usan el mismo código, así una misma serie, período y transformación dan el mismo número en ambos.

## 1. Modelo de datos

Cada serie (`SeriesDef`, en `src/core/registry/`) es **homogénea**: tiene una sola frecuencia, una unidad, un ajuste estacional y una base. Si alguna de esas características cambia, se trata de otra serie con otro ID.

| Campo | Contenido |
|---|---|
| `id` | Identificador interno estable `<tema>.<familia>.<apertura>[.<ajuste>]`. Nunca se renombra, porque funciona como clave de columna en Sheets. |
| `source.dataset` + `source.selector` | Endpoint oficial y valores exactos de sus columnas que identifican la serie. Es la trazabilidad al dato oficial. |
| `frequency`, `unit`, `base`, `seasonalAdjustment`, `geography`, `coverage`, `currency` | Metadatos que viajan a Sheets (CATALOGO) y al dashboard. |
| `measure` | Naturaleza económica: `index`, `rate`, `flow`, `balance`, `price_level`, `published_change`. Determina qué transformaciones son válidas. |

Cada observación conserva:
- `period`: el período de referencia.
- `value`: el valor sin redondear, o `null`.
- `flags`: los signos convencionales del INDEC.
- `rawNote`: el texto original de `observaciones`.

A nivel de serie, `meta` registra:
- `retrievedAt`: la fecha de consulta a la API.
- `runId`: la corrida de ingesta.
- `query`: la URL de consulta, sin credenciales.
- `stale`: si los datos provienen de una actualización anterior.

**Tres fechas distintas que no se confunden:**
1. **Período de referencia:** el mes, trimestre o semestre al que corresponde el dato.
2. **Fecha de publicación:** la API **no la expone**. Por eso `publishedAt` queda en `null`. Las revisiones se detectan comparando valores entre corridas (ver §5).
3. **Fecha de consulta:** el momento en que se descargó (`retrievedAt`).

**Períodos canónicos:** `2024-03` (mensual), `2024-Q1` (trimestral), `2024-S1` (semestral), `2024` (anual). Formatos de origen en la API:
- Mensual: `periodo` = `"202403"`.
- Trimestral EPH: `"20241T"`.
- Semestral EPH: `"20241S"`.

Para graficar se usa como fecha el **primer día del período** (por ejemplo, 1-jul-2024 para el 3.er trimestre de 2024).

## 2. Reglas

- **Faltante ≠ cero.** Un valor ausente o con signo convencional (`///`, `s`, `...`, etc.) se guarda como `null`. Nunca se interpola ni se arrastra el valor anterior.
- **No se redondea lo almacenado.** El redondeo es solo de presentación: tarjetas y tablas del dashboard muestran 1 decimal; Sheets guarda los valores completos con formato numérico.
- **No se mezclan** frecuencias (cada pestaña o gráfico tiene una sola), ajustes estacionales ni bases.
- **No se desestacionaliza** por cuenta propia. Se usan las series desestacionalizadas y de tendencia-ciclo que publica el INDEC.
- **No se empalman bases distintas.** Cada serie tiene su base documentada en `unit` y `base`.
- **Porcentajes vs. diferencias:**
  - Sobre tasas (desocupación, pobreza) se calculan diferencias en **puntos porcentuales**.
  - Sobre saldos (saldo comercial) se calculan **diferencias absolutas**.
  - Nunca se calcula un "% de una tasa" ni una variación % de un saldo que puede cambiar de signo.
- **Comparaciones por calendario, no por posición.** Si falta el mes anterior, la variación mensual es `null`; no se convierte en una comparación entre dos meses.

## 3. Transformaciones

| ID | Fórmula | Aplica a |
|---|---|---|
| `pct_prev` | (x_t / x_{t−1} − 1) × 100 | Índices y valores. En **actividad**, solo sobre series desestacionalizadas o tendencia-ciclo (en la original mezcla estacionalidad). En precios y salarios es la medida oficial sobre la serie original. |
| `pct_yoy` | (x_t / x_{t−L} − 1) × 100, con L = 12 (mensual), 4 (trimestral), 2 (semestral) | Índices, valores y flujos. |
| `pct_ytd` | (x_t / x_{dic. año anterior} − 1) × 100 | Índices mensuales de **precios y salarios** y canastas (criterio INDEC del IPC y del índice de salarios). |
| `ytd_avg_pct_yoy` | (Σ x_{ene..t} / Σ x_{ene..t, año anterior} − 1) × 100 | Índices de **actividad** (EMAE, IPI): criterio INDEC de "variación acumulada interanual". Contra diciembre mezclaría estacionalidad, por eso `pct_ytd` no se habilita en actividad. |
| `ytd_sum` | Σ desde el 1.er período del año hasta t. Es `null` si falta algún período del tramo. | Flujos y saldos. |
| `ytd_sum_pct_yoy` | ytd_sum_t vs ytd_sum del mismo tramo del año anterior | Flujos. |
| `sum_12m`, `sum_12m_pct_yoy` | Suma móvil de 12 meses (o 4 trimestres) y su variación interanual | Flujos (y saldos, solo la suma). |
| `diff_yoy_pp` | x_t − x_{t−L} | Tasas (p.p.). |
| `diff_prev_pp` | x_t − x_{t−1} | Tasas desestacionalizadas o anuales. **No** se habilita para tasas sin desestacionalizar sub-anuales (EPH), porque mezcla estacionalidad. |
| `diff_yoy_abs` | x_t − x_{t−L} | Saldos. |
| `rebase_100` | x_t / x̄_base × 100 (x̄_base: valor o promedio del rango base) | Índices, valores y flujos positivos. El período base se muestra siempre. |

Las variaciones que publica la fuente (por ejemplo, la var. m/m del IPC con 1 decimal) se guardan como series `published_change` aparte y **no se re-transforman**. Sirven para contrastar con las calculadas. Las diferencias de hasta ±0,05 p.p. se explican por el redondeo de la publicación; el INDEC lo advierte en su documentación de la API. Ver `docs/validacion.md`.

## 4. Criterios por tema

### Actividad
- **EMAE:** índice base 2004=100, en serie original, desestacionalizada y tendencia-ciclo. La desestacionalizada se **re-estima completa cada mes**, así que los valores históricos cambian con cada publicación y quedan registrados como revisiones.
- **Variación mensual:** solo sobre la serie desestacionalizada. **Interanual:** sobre la serie original.
- **EMAE por sectores:** la API publica solo la serie original. Se compara interanualmente.
- **IPI manufacturero:** base 2004=100, con series original, desestacionalizada y tendencia-ciclo para el nivel general y los bloques.
- **No disponibles en la API:** PIB trimestral y demanda agregada, ISAC, utilización de la capacidad instalada, supermercados, mayoristas y shoppings (ver `docs/cobertura.md`).

### Mercado laboral
- **Índice de salarios:** base oct-2016=100, nominal.
  - Sector privado no registrado: la serie llega hasta el último mes publicado, pero el valor de cada mes refleja salarios de unos 5 meses antes (rezago de la fuente). Ese desfase también afecta al total.
- **Salario real** (cálculo propio): índice de salarios_t / IPC nacional nivel general_t.
  - Ambos son mensuales, sin desestacionalizar y del mismo mes calendario.
  - Se reescala a **dic-2016 = 100**, primer mes del IPC nacional.
  - El IPC nacional es el deflactor compatible porque el índice de salarios es nacional.
  - Limitación: el salario real empieza en dic-2016.
- **EPH:** tasas del **total de 31 aglomerados urbanos**. Esa cobertura **no es nacional** y excluye a la población rural.
  - Las series no están desestacionalizadas, así que se comparan contra el mismo trimestre del año anterior.
  - Algunos trimestres tienen cobertura parcial (aglomerados excluidos), indicada en `observaciones`.
  - Empleo formal e informal: disponibles desde el 4T-2023.
- **SIPA (empleo registrado) y RIPTE:** **no son del INDEC**. Son fuentes complementarias, documentadas pero no integradas en el núcleo.

### Precios
- **IPC:** base dic-2016=100, nacional y 6 regiones. Incluye categorías (núcleo, regulados, estacionales; bienes y servicios) y divisiones COICOP.
  - Se distinguen índices, variaciones (calculadas y publicadas), ponderaciones e incidencias.
  - Las **contribuciones** a la inflación no se calculan como ponderador × variación: los ponderadores son de la canasta base y cambian con los precios relativos. Si hacen falta, se usan las incidencias publicadas (`Incidencia_m`, etc., disponibles en la API).
- **SIPM (IPIM, IPIB, IPP):** base 1993, nivel reexpresado por la API con dic-2015=100.
- **ICC:** Gran Buenos Aires, no total país.
- **Canastas CBA y CBT:** GBA, en **pesos corrientes por mes**. No son índices.
  - Variación % válida.
  - "Hogar 2" = 4 integrantes.

### Comercio exterior
- **Unidad y valuación:** valores en **USD corrientes**, expresados en millones (escala 1e-6 sobre el valor de la API, que viene en USD). Exportaciones **FOB**, importaciones **CIF**.
- **Saldo:** X FOB − M CIF, criterio del INDEC en el ICA. Es comercio de **bienes**; no es la cuenta corriente ni el balance cambiario del BCRA.
- **Construcción de los totales:** la API publica filas por rubro (o uso económico) × subrubro × país. Los totales se construyen sumando todas las filas del período.
  - Los montos con secreto estadístico (`s`) aparecen como `null` en la apertura por país, pero su monto se concentra en el rubro 9 "Confidencial" (exportaciones, desde ene-2018). Por eso **el total** reproduce lo publicado.
  - En cambio, **los rubros PP, MOA, MOI y CyE de la API no equivalen a los del informe ICA**. El informe asigna las operaciones confidenciales a cada rubro y la API no, así que en el proyecto se rotulan "(sin confidencial)". En sep-2026 quedan entre 6 % y 23 % por debajo de lo publicado, y hay un quiebre en ene-2018. Para comparar rubros con el ICA, usar el informe.
  - La apertura por **socio** puede subestimar el comercio con ese país.
- **Valores vs. cantidades:** son valores, no cantidades. La API no publica índices de precios y cantidades ni términos del intercambio.
- **Comercio energético:** el rubro "Combustibles y energía" y el uso "Combustibles y lubricantes" son una aproximación; no equivalen a la balanza energética oficial.

## 5. Revisiones

La API no informa fecha de publicación ni versión, así que las revisiones se detectan **comparando** cada corrida con el store anterior:
- **Revisión:** un período que ya existía cambia de valor (tolerancia relativa 1e-9). Se registra en `data/store/revisions.jsonl` con serie, período, valor anterior, valor nuevo, fecha de detección y corrida. Se muestra en Sheets (pestaña CONTROL) y en el dashboard (página Fuentes).
- **No es revisión:** la llegada de un período nuevo al final de la serie.

Ventanas de revisión:
- Los conjuntos chicos o con series re-estimadas (EMAE, IPI, IPC filtrado, salarios, EPH, etc.) se descargan **completos** en cada corrida, así que cualquier revisión histórica se detecta.
- Comercio exterior (~1,2 M de filas) usa una **ventana de 24 meses** diaria y una **reconciliación completa cada 30 días**, o a pedido con `npm run data:refresh -- --full`.

Las actualizaciones son idempotentes: repetir una corrida no duplica filas ni agrega revisiones.
