# Validación de datos

_Realizada el 2026-11-04 sobre el store real (`data/store/`, corrida `20261104T132949Z-1695`, `dataMode: real`, 139 series). Scripts auxiliares fuera del repo; pruebas automáticas en `tests/validation/`._

Los valores calculados salen de `src/core/transforms.ts` (`applyTransform` / `transformSeries`), la misma implementación que usan Sheets y el dashboard. Se contrastaron contra dos fuentes:

- **Variaciones publicadas en la propia API.** Son las filas `v_m`, `v_ia`, `v_acum`, "Variación interanual", etc., consultadas con token y comparadas en **toda la historia**, no solo el último dato.
- **Informes técnicos del INDEC** descargados de indec.gob.ar (PDF, texto extraído).

## 1. Contraste con publicaciones oficiales

Notación: "calc." es el valor calculado desde el store sin redondear; "pub." es el valor publicado. Diferencias en p.p. salvo que se indique otra unidad.

Abreviaturas de las fuentes (informes técnicos del INDEC en `https://www.indec.gob.ar/uploads/informesdeprensa/`):
- **[EMAE]** `emae_10_263A9DC1ED2B.pdf` (21/10/2026)
- **[IPI]** `ipi_manufacturero_10_264B0CD91C87.pdf` (07/10/2026)
- **[SAL]** `salarios_10_2623B4ABF4FA.pdf`
- **[EPH]** `mercado_trabajo_eph_2trim26433FCBC5A8.pdf`
- **[POB]** página https://www.indec.gob.ar/Nivel4/Tema/4/46/152 (informe `eph_pobreza_09_2670733F4C4D.pdf`, 24/09/2026; el PDF no se abrió, se usó la página)
- **[IPC]** `ipc_10_268C45A9444C.pdf` (13/10/2026)
- **[IPM]** `ipm_10_264148D51FC8.pdf` (16/10/2026)
- **[CAN]** `canasta_10_26DA5CEEFE06.pdf`
- **[ICA]** `ica_10_263F42E3F39F.pdf` (19/10/2026)

"API v_m" significa la fila publicada en el endpoint con ese `tipo_de_indicador`.

### Actividad

| Tema | Indicador | Período | Calc. (API) | Publicado | Fuente | Dif. | Explicación |
|---|---|---|---:|---:|---|---:|---|
| Actividad | EMAE var. i.a. (original) | ago-26 | −1,744 | −1,744 / −1,7 | API "Var % interanual serie original" / [EMAE] | 0,000 | Idéntica: la API publica sin redondear. 260 meses, dif. máx. 7e-15. |
| Actividad | EMAE var. m/m desestacionalizada | ago-26 | 0,066 | 0,066 / 0,1 | API "Var % mensual serie desest." / [EMAE] | 0,000 | Idéntica en 271 meses. |
| Actividad | EMAE var. m/m tendencia-ciclo | ago-26 | 0,016 | 0,016 / 0,0 | API / [EMAE] | 0,000 | Idéntica. |
| Actividad | EMAE nivel original / desest. | ago-26 | 147,75 / 149,89 | 147,8 / 149,9 | [EMAE] cuadro 2 | redondeo | — |
| Actividad | EMAE sector D (industria) var. i.a. | ago-26 | −3,241 | −3,241 | API "Variación porcentual interanual" | 0,000 | Idéntica en 260 meses. |
| Actividad | IPI manufacturero var. i.a. | ago-26 | −3,236 | −3,236 / −3,2 | API "Variación interanual" / [IPI] | 0,000 | Idéntica en 116 meses. |
| Actividad | IPI manufacturero var. m/m desest. | ago-26 | 1,928 | 1,928 / 1,9 | API "Variación intermensual" / [IPI] | 0,000 | Idéntica en 127 meses. |
| Actividad | IPI manufacturero acumulado i.a. (ene–ago) | ago-26 | −2,724 (*) | −2,724 / −2,7 | API "Variación acumulada interanual" / [IPI] | 0,000 | (*) Calculado como promedio ene–t contra el mismo tramo del año anterior. **La transformación `pct_ytd` del proyecto da +6,51 %**: ver hallazgo A1. |

### Mercado laboral

| Tema | Indicador | Período | Calc. (API) | Publicado | Fuente | Dif. | Explicación |
|---|---|---|---:|---:|---|---:|---|
| Laboral | Índice de salarios total var. m/m | ago-26 | 2,729 | 2,73 / 2,7 | API v_m / [SAL] | −0,001 | La API publica las variaciones con 2 decimales. |
| Laboral | Índice de salarios total var. i.a. | ago-26 | 35,613 | 35,61 / 35,6 | API v_ia / [SAL] | 0,003 | Redondeo. |
| Laboral | Índice de salarios total var. acumulada | ago-26 | 25,145 | 25,14 / 25,1 | API v_acum / [SAL] | 0,005 | Redondeo. |
| Laboral | Salarios privado registrado / público / no registrado, var. m/m | ago-26 | 2,832 / 2,260 / 2,998 | 2,83 / 2,26 / 3,00 (2,8 / 2,3 / 3,0) | API v_m / [SAL] | ≤ 0,002 | Redondeo. |
| Laboral | Salarios privado registrado / público / no registrado, var. i.a. | ago-26 | 30,420 / 30,307 / 55,355 | 30,42 / 30,31 / 55,36 | API v_ia / [SAL] | ≤ 0,005 | Redondeo. |
| Laboral | Salarios, historia completa (5 aperturas × m/m, i.a., acum.) | 2015–2026 | — | — | API | típ. ≤ 0,013 | El índice se publica con 2 decimales y vale ≈100 en 2016: eso genera un error de hasta ~0,01 p.p. respecto de la variación publicada (calculada sin redondear). **5 excepciones de 0,02 a 0,14 p.p.**, todas con jul-2023 como denominador: público m/m ago-23 calc. 6,013 vs pub. 5,96; público i.a. jul-24 170,10 vs 169,96; registrado m/m ago-23 7,470 vs 7,45; registrado i.a. jul-24 210,80 vs 210,74; total i.a. jul-24 206,24 vs 206,19. Es una inconsistencia **de la fuente**: el índice público de jul-23 publicado (1.625,51) no coincide con el que implican sus propias variaciones (≈1.626,3). Ver B3. |
| Laboral | Tasa de desocupación (31 aglomerados) | 2T-26 | 7,9 | 7,9 | [EPH] | 0 | Dato de la API = informe. Dif. i.a. +0,3 p.p. (2T-25: 7,6). Marcado `provisorio`. |
| Laboral | Tasas de actividad / empleo | 2T-26 | 48,9 / 45,0 | 48,9 / 45,0 | [EPH] | 0 | — |
| Laboral | Pobreza personas / hogares | 1S-26 | 32,3 / 24,4 | 32,3 / 24,4 | [POB] | 0 | 2S-25: 28,2. |
| Laboral | Indigencia personas / hogares | 1S-26 | 7,5 / 5,6 | 7,5 / 5,6 | [POB] | 0 | — |

### Precios

| Tema | Indicador | Período | Calc. (API) | Publicado | Fuente | Dif. | Explicación |
|---|---|---|---:|---:|---|---:|---|
| Precios | IPC nacional var. m/m | sep-26 | 1,934 | 1,9 | API v_m / [IPC] | 0,034 | Redondeo a 1 decimal. 117 meses, máx. 0,0500. |
| Precios | IPC nacional var. i.a. | sep-26 | 33,355 | 33,4 | API v_ia / [IPC] | −0,045 | Redondeo. 106 meses, máx. 0,0500. |
| Precios | IPC nacional var. acumulada | sep-26 | 23,641 | 23,6 | API v_acum / [IPC] | 0,041 | Redondeo. 117 meses, máx. 0,049. |
| Precios | IPC núcleo var. m/m (i.a.) | sep-26 | 1,676 (31,625) | 1,7 (31,6) | API v_m, v_ia / [IPC] | −0,024 (0,025) | Redondeo. |
| Precios | IPC regulados / estacionales var. m/m | sep-26 | 2,336 / 2,947 | 2,3 / 2,9 | API / [IPC] | 0,036 / 0,047 | Redondeo. |
| Precios | IPC GBA var. m/m; división alimentos var. m/m | sep-26 | 2,007; 2,004 | 2,0; 2,0 | API / [IPC] cuadro 1 | < 0,01 | Redondeo. |
| Precios | IPIM var. m/m | sep-26 | 3,159 | 3,2 | API v_m / [IPM] | −0,041 | Redondeo. 129 meses, máx. 0,049. Dato provisorio. |
| Precios | IPIM var. i.a. / acumulada | sep-26 | 29,151 / 22,825 | 29,2 / 22,8 | API / [IPM] | −0,049 / 0,025 | Redondeo. |
| Precios | IPIB / IPP var. m/m | sep-26 | 3,441 / 3,843 | 3,4 / 3,8 | API / [IPM] | 0,041 / 0,043 | Redondeo. |
| Precios | ICC var. m/m / i.a. | sep-26 | 1,502 / 31,324 | 1,5 / 31,3 | API | 0,002 / 0,024 | Redondeo. Informe técnico no consultado. |
| Precios | CBT adulto equivalente (GBA) | sep-26 | $528.318,67 | $528.318,67 | [CAN] cuadro 2 | 0 | Exacto. |
| Precios | CBA adulto eq.; CBT y CBA hogar 2 | sep-26 | $239.058,22; $1.632.504,69; $738.689,90 | idénticos | [CAN] | 0 | Exacto. |
| Precios | CBT var. m/m / i.a. | sep-26 | 1,682 / 38,718 | 1,7 / 38,7 | API / [CAN] | −0,018 / 0,018 | Redondeo. CBA i.a.: 39,97 vs 40,0. |

### Comercio exterior

| Tema | Indicador | Período | Calc. (API) | Publicado | Fuente | Dif. | Explicación |
|---|---|---|---:|---:|---|---:|---|
| Comex | Exportaciones (M USD) | sep-26 | 10.035,98 | 10.036 | [ICA] | redondeo | i.a. 23,47 vs 23,5. |
| Comex | Importaciones (M USD) | sep-26 | 7.059,50 | 7.060 | [ICA] | redondeo | i.a. −1,83 vs −1,8. |
| Comex | Saldo (M USD) | sep-26 | 2.976,47 | 2.976 | [ICA] | redondeo | Dif. i.a. +2.039,4 vs +2.039. |
| Comex | Exportaciones acumuladas | ene–sep 26 | 77.267,0 | 77.267 | [ICA] | 0 | Var. 21,62 vs 21,6. |
| Comex | Importaciones acumuladas | ene–sep 26 | 56.068,8 | 56.069 | [ICA] | redondeo | Var. −2,47 vs −2,5. |
| Comex | Saldo acumulado | ene–sep 26 | 21.198,3 | 21.198 | [ICA] | 0 | — |
| Comex | Importaciones por uso (BK, BI, CyL, PyA, BC, VA, resto) | sep-26 y acum. | 1.413 / 2.521 / 181 / 1.256 / 1.129 / 450 / 110; acum. 10.690 / 19.470 / 3.024,5 / 9.642 / 8.322 / 3.919 / 1.002 | idénticos | [ICA] | redondeo | Coinciden. |
| Comex | **Exportaciones por rubro: PP / MOA / MOI / CyE** | sep-26 | 2.025,5 / 3.029,8 / 2.393,6 / 1.363,8 (+ confidencial 1.223,4) | 2.225 / 3.495 / 2.534 / 1.781 | [ICA] | −199 / −465 / −140 / −417 | **No coinciden**: el ICA distribuye las operaciones confidenciales entre los rubros; el store las deja en el rubro 9. La suma de diferencias (−1.222) es igual al rubro confidencial. En variación i.a.: CyE 57,0 vs 89,1; MOI 28,8 vs 17,5; PP 6,4 vs 9,2; MOA 15,3 vs 16,8. Ver A2. |
| Comex | Exportaciones por rubro, acumulado | ene–sep 26 | 17.269 / 22.410 / 19.028 / 10.477 | 18.696 / 25.704 / 20.415 / 12.452 | [ICA] | Σ = −8.083,5 | La diferencia total es igual al rubro confidencial acumulado (8.083,5). |
| Comex | Socios: expo / impo China, Brasil, EE.UU. | sep-26 | X 917,3 / 1.203,5 / 992,0; M 1.815,5 / 1.375,0 / 626,5 | X 986 / 1.206 / 1.011; M 1.817 / 1.375 / 631 | [ICA] | X −68,7 / −2,5 / −19; M −1,5 / 0 / −4,5 | En exportaciones, el faltante se explica por las celdas confidenciales "s", excluidas y documentadas. En importaciones (que no tienen celdas "s"), las diferencias de 1,5 y 4,5 M USD (<1 %) **no están explicadas**. Hipótesis: el ICA atribuye el país de otra forma (origen vs. procedencia, courier). Ver B4. |

**Resumen del contraste:** las 50+ comparaciones de titulares coinciden con lo publicado dentro del redondeo. Las diferencias fuera del redondeo son tres:
- las variaciones de salarios con base jul-2023 (inconsistencia de la fuente);
- los rubros de exportación (criterio de construcción del proyecto, A2);
- la "variación acumulada" de los índices de actividad (transformación mal definida para ese caso, A1).

## 2. Consistencia económica del store

Verificado con un script sobre las 139 series. Las verificaciones automatizables quedaron como pruebas en `tests/validation/`.

### Sin problemas

- **Inventario:** 139 series en el registro = 139 archivos. El manifest dice `dataMode: real` y la última corrida terminó `ok`. El conteo y el último período de cada serie coinciden con el archivo.
- **Estructura:**
  - orden ascendente, sin duplicados ni huecos de calendario;
  - frecuencia de cada período = la de la definición;
  - sin `meta.synthetic`;
  - todos los valores finitos.
- **Faltantes y ceros:**
  - **No hay ningún `null` en el store.** Se recortan los nulos de los extremos y no hay nulos intermedios.
  - **No hay ningún 0.**
  - No hay negativos en índices, flujos ni canastas, y no hay tasas fuera de [0, 100].
  - Signos presentes, todos `provisorio` y coherentes con los informes (solo en el último período, salvo ICC, que tiene 6 meses provisorios):
    - EPH: último trimestre;
    - pobreza: último semestre;
    - SIPM: sep-26;
    - ICC: abr–sep-26.
- **Bases:**
  - IPC dic-2016 = 100;
  - salarios oct-2016 = 100;
  - SIPM dic-2015 = 100;
  - ICC ene-2022 = 100 (como dice la API);
  - el promedio de 2004 del EMAE original es 100,000.
- **Escala de comercio:** totales mensuales en millones de USD (mínimo histórico 226 M USD en feb-1990; desde 2010, entre 1.000 y 20.000).
- **Saldo = X − M:** exacto en los 489 meses (dif. máx. 0).
- **Σ rubros (incluido el 9 "Confidencial") = total exportado:** 489 meses, dif. máx. 1,9e-11.
- **Σ usos = total importado:** 489 meses, dif. máx. 1,8e-11.
- **Salario real:**
  - base dic-2016 = 100 exacta;
  - recalculado a mano: dif. 0;
  - rangos plausibles: registrado mín. 68,2 (ene-24), máx. 104,2 (ago-17), último 75,1 (ago-26); total mín. 62,1 (mar-24), último 79,0; privado registrado último 80,4; público último 66,1 (mín. 61,0, ene-24).
  - Las caídas de 2018-19 y de dic-23/ene-24 son las esperables.
- **Extremos:** todos tienen explicación económica.
  - abr-20 (ASPO) y efecto base de abr-21 en EMAE e IPI por bloques (p.ej. automotores i.a. abr-21 +755 %; tabaco desest. may-20 +1.038 % desde un nivel de 8,9);
  - dic-23 en precios (IPIM +54 % m/m; importados +80,6 %);
  - comercio 1987–1992, con bases muy chicas (vehículos importados may-89: 0,005 M USD, de ahí +10.297 % i.a. en may-90).
  - No se encontraron valores aislados sospechosos.
- **Titulares del registro (`headline`):** los 8 usan transformaciones permitidas y tienen sentido:
  1. IPC m/m + i.a.;
  2. EMAE i.a. sobre original;
  3. EMAE m/m sobre desestacionalizada;
  4. IPI m/m sobre desestacionalizada;
  5. saldo en nivel + dif. absoluta i.a.;
  6. salarios i.a.;
  7. desocupación en nivel + dif. i.a. en p.p.;
  8. IPIM m/m + i.a.

  Matiz en B1.

### Hallazgos (ordenados por severidad)

**A1 — ALTA. `pct_ytd` ("Var. % acumulada en el año", contra diciembre) habilitada para índices de actividad.**
- **Dónde:** `src/core/transforms.ts:116-119` (`allowedTransforms` solo quita `pct_prev` para actividad en serie original; `pct_ytd` queda habilitada vía `ALLOWED_BY_MEASURE.index`, línea 96).
- **Por qué está mal:** sobre una serie original de actividad, comparar el mes contra diciembre mezcla estacionalidad. Además no es la "variación acumulada" que publica el INDEC para EMAE e IPI (promedio enero–t contra el mismo tramo del año anterior).
- **Evidencia (ago-26):**

  | Indicador | `pct_ytd` del proyecto | Acumulado INDEC |
  |---|---:|---:|
  | IPI manufacturero | +6,51 % | −2,7 % [IPI] |
  | EMAE | −3,96 % | +1,24 % (fórmula INDEC sobre el store) |

- **Dónde se expone:**
  - Sheets: `CALCULOS_*` vía `defaultCalcTransforms` (`src/core/views.ts:88-90` → `src/sheets/layout.ts:372`);
  - dashboard: `src/app/actividad/page.tsx:53` y `:93` ofrecen `pct_ytd` para sectores del EMAE y bloques del IPI.
- **Propuesta de arreglo:**
  - excluir `pct_ytd` cuando `topic === 'actividad'`;
  - agregar una transformación `ytd_avg_pct_yoy` = (Σ_{ene..t} x_y / Σ_{ene..t} x_{y−1} − 1) × 100, válida para índices de actividad en serie original. Esta fórmula reproduce exactamente la "Variación acumulada interanual" del IPI en la API: 116 meses, dif. 0.

**A2 — ALTA. Las exportaciones por grandes rubros del store no son los rubros del ICA.**
- **Qué pasa:** el store deja las operaciones confidenciales en el rubro 9; el INDEC, en el ICA, las reparte entre PP/MOA/MOI/CyE.
- **Magnitud:** sep-26, PP −9 %, MOA −13 %, MOI −6 %, CyE −23 % respecto del ICA; la variación i.a. de CyE da 57,0 % contra 89,1 % publicado.
- **Quiebre en ene-2018** (primer mes con rubro 9: 606 M USD, 12,6 % del total): las variaciones i.a. de los rubros durante 2018 comparan niveles con y sin confidencial. En jun-18, Σ de los 4 rubros i.a. = −16,0 % contra un total de −0,5 %.
- **Dónde:**
  - `src/core/registry/comex.ts:57-82`: nombres "Exportaciones — Productos primarios (FOB)", etc., sin advertencia; `SUM_NOTE` en la línea 16 lo dice pero no avisa que no coincide con el ICA.
  - `docs/metodologia.md:106` ("Por eso los totales y rubros son consistentes").
  - `docs/cobertura.md:54`.
- **Propuesta (sin cambiar los IDs):**
  - agregar a las 4 series una nota: "excluye operaciones confidenciales (rubro 9) desde ene-2018; no coincide con los rubros del ICA; variaciones i.a. de 2018 afectadas por el quiebre";
  - cambiar `shortName` a "PP (sin confid.)", etc.;
  - corregir la frase de la metodología.
  - Si la API ofreciera la apertura del confidencial por rubro, construirla. A la fecha **no** la ofrece: las celdas "s" llegan en null.

**A3 — MEDIA. La nota del salario no registrado es inexacta.**
- **Dónde:** `src/core/registry/laboral.ts:40` y `:80`, `docs/metodologia.md:80`, `docs/cobertura.md:31`. Dicen que "los últimos meses pueden faltar".
- **Qué pasa en realidad:**
  - la API publica el código 200 hasta el mismo mes que el resto (ago-26, 3,0 % m/m);
  - según el informe [SAL], el rezago de 5 meses está en el **contenido**: el índice del mes surge de promedios trimestrales móviles de la EPH.
- **Consecuencias:**
  - `laboral.salarios.total` y `laboral.salarios.total_real` combinan un componente con rezago;
  - el salario real total deflacta ingresos de ~5 meses antes con el IPC del mes;
  - el titular 6 (salarios total i.a.) hereda esa mezcla.
- **Propuesta:**
  - redactar: "El componente no registrado tiene un rezago de 5 meses en su información (promedios móviles de la EPH): el valor del mes t refleja ingresos de ~t−5. No faltan meses.";
  - evaluar el titular sobre `laboral.salarios.registrado`, o mantener el total con esa advertencia.

**A4 — MEDIA-BAJA. `diff_prev_pp` habilitada y calculada por defecto para tasas EPH sin desestacionalizar.**
- **Dónde:** `src/core/transforms.ts:97`; entra en `CALCULOS_EPH_TASAS_Q` y `CALCULOS_POBREZA_S` por `src/core/views.ts:88-90`.
- **Conflicto:** contradice la regla de `docs/metodologia.md` ("comparar contra el mismo trimestre del año anterior"). El INDEC publica comparaciones t/t con prueba de significancia, pero una diferencia t/t sin esa prueba mezcla estacionalidad.
- **Propuesta:** quitarla de `defaultCalcTransforms` para `measure: 'rate'` con `seasonalAdjustment: 'original'`, o mantenerla con una etiqueta "no desestacionalizada".

**B1 — BAJA. Titular de salarios.** Ver A3: el titular usa el índice total, que incluye el componente no registrado con rezago.

**B2 — BAJA. `price_level` (canastas) no admite `pct_ytd`** (`src/core/transforms.ts:100`), aunque el INDEC la publica: CBT acumulada sep-26 = 24,7 %. Es una omisión, no un error. Propuesta: agregar `pct_ytd` a `price_level` (frecuencia mensual).

**B3 — BAJA (de la fuente, no del proyecto). Salarios jul-2023.** Las variaciones publicadas por la API para ago-23 (m/m) y jul-24 (i.a.) del sector público, el registrado y el total no son consistentes con el índice de jul-23 publicado: diferencias de 0,02 a 0,14 p.p. El proyecto calcula desde el índice, que es lo correcto; hay que documentarlo si alguien compara contra la variación publicada.

**B4 — BAJA. Socios.** La sub-estimación de las exportaciones por país está documentada (China −7 % en sep-26). En importaciones hay diferencias pequeñas sin explicar contra el ICA: China −1,5 M USD, EE.UU. −4,5 M USD.

**B5 — COSMÉTICO.** Las notas de cobertura de la EPH se guardan en todas las tasas del trimestre, porque `observaciones` es por fila. Así, `laboral.eph.desocupacion` 2023-Q4 lleva la nota "La información respecto a la condición de formalidad… a partir del 4T-2023", que solo aplica a las tasas de formalidad (`src/ingest/normalize.ts`, construcción de `rawNote`).

**Info.** `data/store/revisions.jsonl` no existe: hubo 0 revisiones entre las dos corridas del 2026-11-04. `readRevisions` lo trata como lista vacía.

### Transformaciones permitidas (`allowedTransforms`), revisión por combinación

| Combinación | Permitidas | Evaluación |
|---|---|---|
| actividad · index · M · original | level, pct_yoy, pct_ytd, rebase_100 | `pct_ytd` incorrecta (A1). El resto, bien. |
| actividad · index · M · desest./tend.-ciclo | level, pct_prev, pct_yoy, pct_ytd, rebase_100 | Correcto. pct_yoy sobre desest. es aceptable, aunque el INDEC usa la original. `pct_ytd` vs dic. es poco usual pero no mezcla estacionalidad. |
| laboral · index (salarios) | level, pct_prev, pct_yoy, pct_ytd, rebase_100 | Correcto (coincide con v_m/v_ia/v_acum publicadas). |
| precios · index | level, pct_prev, pct_yoy, pct_ytd, rebase_100 | Correcto (coincide con lo publicado). |
| precios · price_level (canastas) | level, pct_prev, pct_yoy, rebase_100 | Correcto; falta pct_ytd (B2). |
| laboral · rate · Q/S | level, diff_prev_pp, diff_yoy_pp | Correcto: no hay % sobre tasas. Advertencia en A4. |
| comex · flow | level, pct_yoy, ytd_sum, ytd_sum_pct_yoy, sum_12m, sum_12m_pct_yoy, rebase_100 | Correcto: sin m/m sobre serie original; ytd_sum y ytd_sum_pct_yoy reproducen el ICA. |
| comex · balance | level, diff_yoy_abs, ytd_sum, sum_12m | Correcto: sin % sobre un saldo que cambia de signo. |
| published_change | level | Correcto: no se re-transforma. |

## 3. Qué se verificó con fixtures y qué contra servicios reales

### Contra servicios y datos reales
- **Store real** (`data/store`, descargado de la API oficial el 2026-11-04):
  - invariantes estructurales y económicas;
  - saldo y sumas de rubros y usos;
  - bases;
  - salario real;
  - variaciones publicadas en el store contra calculadas (EMAE, IPC).
  - Automatizado en `tests/validation/*.test.ts` (435 pruebas). Si no hay store real, se saltea con un aviso `[validación] SE SALTEA …`.
- **API INDEC en vivo** (con token, desde un script fuera del repo; el token no se imprimió): filas v_m, v_ia, v_acum y equivalentes de EMAE (tendencia-ciclo, sectores), IPI manufacturero, índice de salarios (5 aperturas), IPC (nivel general nacional y GBA, categorías, división alimentos), SIPM (IPIM, IPIB, IPP), ICC y canastas. Se compararon contra lo calculado en toda la historia disponible. **No forma parte de las pruebas automáticas**, porque dependen de red y token.
- **Informes técnicos del INDEC** (PDF de indec.gob.ar, texto extraído): EMAE, IPI, salarios, EPH, IPC, IPM, canastas e ICA. Pobreza, desde la página del tema en indec.gob.ar.

### Con datos simulados o fixtures
- **Revisión que llega a ambos productos** (`tests/validation/revision-propagation.test.ts`):
  - se hace sobre una **copia temporal** del store real; el store real no se toca y se verifica con hashes;
  - se simula una revisión (IPC +0,5 % en ago-26; exportaciones +1 % en sep-26);
  - se detecta con `detectRevisions` y se registra en `revisions.jsonl` de la copia;
  - se recalculan las derivadas con `buildDerivedSeries`;
  - se verifica que el plan de Sheets (`loadStoreSource` → `planTopic`, pestañas DATOS y CALCULOS) y el dashboard (`getClientSeries` → `buildChartModel`) muestran el valor nuevo y que ambos dan el mismo número;
  - **no** ejecuta una corrida de ingesta completa contra la API: la ingesta con PostgREST emulado se prueba en `tests/ingest/`.
- **Pruebas preexistentes** (`tests/core`, `tests/ingest`, `tests/sheets`, `tests/web`): usan series sintéticas, el emulador PostgREST (`tests/ingest/helpers.ts`) y muestras reales mínimas (`tests/fixtures/real/`).

### No verificado
- Escritura en **Google Sheets reales**: falta la autorización OAuth (ver `docs/estado.md`). Solo se verificó el plan de celdas en memoria.
- **Dashboard en el navegador**: no se levantó `next dev`; se verificó la capa de datos del servidor y el modelo de gráfico.

## 4. Limitaciones

- **Fecha de publicación:** la API no la expone. El contraste con informes técnicos usa el informe vigente al 2026-11-04; si el INDEC revisa datos, los informes anteriores pueden diferir legítimamente del store.
- **Lectura de PDF:** los valores publicados se tomaron del texto extraído con `pdftotext`. Los cuadros con columnas desalineadas (p.ej. el acumulado del EMAE en el cuadro 1) no se usaron. Para la pobreza se usó la página del tema en indec.gob.ar, no el PDF.
- **Cobertura del contraste:**
  - ICC y aperturas del IPIM: solo contra la API, no contra el informe;
  - EMAE por sectores: solo el sector D;
  - IPI por bloques: no se contrastó contra lo publicado.
- **Socios comerciales:** las diferencias de importaciones (<1 %) quedan sin explicar.
- **Tolerancia de redondeo:** se aceptó ±0,05 p.p. para variaciones publicadas con 1 decimal. Para salarios (2 decimales) la diferencia típica llega a ~0,013 p.p., porque el índice también tiene 2 decimales.
- **Prueba de revisión:** usa la misma lógica que la ingesta (`detectRevisions`, `buildDerivedSeries`) pero no el orquestador `refresh.ts` completo.

## Correcciones aplicadas tras la validación (2026-11-04)

| Hallazgo | Estado | Cambio |
|---|---|---|
| A1: acumulada de actividad contra diciembre | **Corregido** | Nueva transformación `ytd_avg_pct_yoy`, (Σ ene..t / Σ ene..t año anterior − 1) × 100, que reproduce el criterio del INDEC. `pct_ytd` queda deshabilitada en actividad (`src/core/transforms.ts`). En Sheets se eliminaron las columnas viejas, todavía sin uso, y se agregaron las nuevas. Prueba en `tests/core`. |
| A2: rubros de exportación sin la parte confidencial | **Documentado** | Los nombres pasan a "(sin confidencial)" y se agregó una nota en el registro sobre la diferencia con el ICA y el quiebre de ene-2018. Corregidos `docs/metodologia.md` y `docs/cobertura.md`. Pendiente: aproximar los rubros del ICA, que requeriría una fuente adicional. |
| A3: nota del salario no registrado | **Corregido** | Las notas aclaran que el rezago de ~5 meses está en el contenido de cada dato y que la serie no tiene huecos al final (registro, metodología y cobertura). |
| A4: `diff_prev_pp` en tasas sin desestacionalizar | **Corregido** | Ya no se habilita para tasas sub-anuales originales. El dashboard explica el motivo y en Sheets se eliminaron esas columnas. |
| B2: acumulada en canastas | **Corregido** | `price_level` admite `pct_ytd`. |
| Aviso de secreto estadístico en los totales del dashboard | **Corregido** | El texto ahora aclara que el total incluye lo confidencial y que las aperturas por rubro o país no. |
| B3, B4, B5 | Abiertos (baja severidad) | Ver arriba. |

## Verificaciones contra servicios reales (integración)

- **Google Sheets** (documentos reales, 2026-11-04):
  - **Creación:** se crearon los 4 documentos con configuración regional es_AR, zona horaria de Buenos Aires y fechas como serial numérico.
  - **Idempotencia:** una segunda sincronización no crea pestañas, filas ni gráficos; solo actualiza CONTROL.
  - **Coincidencia con el dashboard:** la columna IPC nacional var. % m/m de `CALCULOS_IPC_NIVEL_GENERAL_M` coincide en sus 118 meses, sin ninguna discrepancia, con el resultado de `buildWideTable` del dashboard.
  - **Pestañas y gráficos manuales:** una pestaña manual y un gráfico en GRAFICOS_USUARIO sobrevivieron a la sincronización. Se borraron después de la prueba.
  - **Revisiones:** una revisión simulada del EMAE desestacionalizado (abr-2020) llegó a la celda; después se restauró el valor oficial.
  - **Límite de cuota:** el reintento con backoff ante HTTP 429 se ejercitó con la API real.
- **Dashboard:** build de producción con el store real, las 6 rutas responden HTTP 200, se revisaron capturas a 1440 px y el escaneo de secretos del bundle pasa.
- **Instalación limpia:** fuera de OneDrive, sin `.env` ni datos. `npm ci`, `npm run lint`, `npm test` y el build con fixtures funcionan. Las pruebas que necesitan el store real se saltean con aviso.
