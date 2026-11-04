# Auditoría de la API de INDEC

_Verificado contra la API real el 2026-11-04 (consultas con token y corridas completas de `npm run data:refresh`). Implementación: `src/ingest/`._

## Acceso

| Aspecto | Detalle |
|---|---|
| URL base | `https://api.indec.gob.ar/v1` (configurable con `INDEC_API_BASE_URL`) |
| Tecnología | PostgREST (header `Proxy-Status: PostgREST`), detrás de nginx |
| Especificación | OpenAPI 2.0 pública, copia en `docs/api/openapi-indec-v1.json` (19 endpoints) |
| Autenticación | `Authorization: Bearer <JWT>`. El JWT se genera en https://api.indec.gob.ar/ (perfil → generar token) y se guarda en `.env` como `INDEC_API_TOKEN`. |
| Sin token / token inválido | `401` con cuerpo `{"code":"42501","details":null,"hint":null,"message":"permission denied for schema api"}` (muestra en `fixtures/real/401-sin-token.http`). Con un JWT inválido o mal firmado: `401` `{"code":"PGRST301","message":"No suitable key or wrong key type"}`. En ambos casos el cliente lo clasifica como `auth`, **no reintenta** y la corrida se interrumpe (conservando el store). |
| Métodos | `GET`, `HEAD`, `OPTIONS` |
| Rate limit | No se observaron headers de límite (`X-RateLimit-*`) ni respuestas 429 en ~1.330 requests consecutivas. Igual se respeta `Retry-After` en 429/503 y se espacian las requests (`INDEC_MIN_INTERVAL_MS`, 250 ms por defecto). |
| Latencia observada | 0,35–0,65 s por página de 1.000 filas, incluso con `offset` alto (778.000). |

**Seguridad:** el token viaja solo en el header. Nunca se incluye en URLs, logs, caché, fixtures ni mensajes de error (`redactSecrets` elimina cualquier texto con forma de JWT o `Bearer …`). `meta.query` de cada serie guarda la URL de consulta sin credenciales.

## Endpoints usados

| Endpoint | Filas (2026-11-04) | Período | Clave primaria (orden de paginación) | Modo de descarga |
|---|---:|---|---|---|
| `/estimador-mensual-de-actividad-economica-nivel-general` | 1.632 | 2004-01 → 2026-08 | `tipo_de_indicador_descripcion, anio, mes, periodo, tipo_de_indicador` | completo |
| `/estimador-mensual-de-actividad-economica-sectores` | 8.512 | 2004-01 → 2026-08 | `anio, mes, codigo, descripcion, periodo, tipo_de_indicador` | completo |
| `/ipi_manufacturero` | 41.344 (15.232 con filtro) | 2016-01 → 2026-08 | `periodo, indicador, cuadro_web, codigo_CLaNAE_2004, descripcion, serie, tipo_de_indicador` | completo, `tipo_de_indicador=eq.Índice` |
| `/ipc_nacional` | 234.198 (29.610 con filtro) | 2016-04 → 2026-09 (nivel general desde 2016-12) | 12 columnas (ver `src/core/datasets.ts`) | completo, `nivel=in.("Nivel General","Categoría","División")&tipo_de_indicador=in.(Indice,v_m)` |
| `/valorizacion_canastas_cba_cbt` | 1.638 | 2016-04 → 2026-09 | 12 columnas | completo |
| `/indice_salarios` | 3.406 | 2015-10 → 2026-08 | 11 columnas | completo |
| `/icc_precios_construccion` | 14.017 | 2015-11 → 2026-09 | 13 columnas | completo |
| `/sipm_precios_mayoristas` | 234.260 (4.160 con filtro) | 2015-12 → 2026-09 | 13 columnas | completo, `nivel=in.("Nivel general","Origen","Sector")&tipo_de_indicador=in.(Indice,v_m)` |
| `/mercado_trabajo_eph` | 41 | 2016-Q2 → 2026-Q2 | `area_geografica_nom, periodo` | completo |
| `/pobreza_eph` | 20 | 2016-S2 → 2026-S1 | `area_geografica_nom, periodo` | completo |
| `/comercio_exterior_exportacion_bienes` | 779.536 | 1986-01 → 2026-09 | `Anio, Mes, Periodo, rubro_cod, subrubro_cod, pais_cod` | ventana de 24 meses (`Periodo=gte.AAAAMM`) + completo cada 30 días |
| `/comercio_exterior_importacion_bienes` | 390.315 | 1986-01 → 2026-09 | `Anio, Mes, Periodo, uso_economico_cod, gce_cod, pais_cod` | ídem |
| `/comercio_exterior_nomenclaturas` | 325 | — | `nombre_columna, codigo` | completo (→ `data/store/nomenclaturas.json`) |
| `/ipi_minero` | 17.632 | 2017-01 → 2026-08 | 11 columnas | configurado; sin series en el registro |

Endpoints del OpenAPI no usados: proyecciones/estimaciones de población, redeterminación de precios de obra pública, canasta de crianza. Dimensiones completas: `docs/catalogo-dimensiones.md` (`npm run data:discover`).

## Filtros PostgREST

- Sintaxis `columna=operador.valor`: `eq.`, `gte.`, `lte.`, `in.(a,b)`, `not.is.null`. Los valores con espacios o comas van entre comillas dobles dentro de `in.(…)`: `in.("Nivel General","Categoría","División")`.
- **Todo se codifica con `encodeURIComponent`** (espacios como `%20`, acentos en UTF-8, comillas `%22`, comas `%2C`). Verificado: `nivel=in.(%22Nivel%20General%22%2C%22Categor%C3%ADa%22%2C%22Divisi%C3%B3n%22)` devuelve 29.610 filas con el filtro de tipo; `tipo_de_indicador=eq.%C3%8Dndice` funciona en IPI.
- `select=col1,col2` reduce columnas (comercio exterior pide también `valor_FOB_null` / `valor_CIF_null`, que sí son seleccionables aunque no estén en el OpenAPI).
- Los filtros de período comparan texto (`periodo` es `AAAAMM` de longitud fija), por lo que `gte.202411` es correcto.

## Paginación y límites

- Máximo **1.000 filas por respuesta** aunque `limit` sea mayor. El cliente pide `limit=1000` y avanza `offset` por la cantidad de filas efectivamente recibida.
- Orden obligatorio por la **clave primaria completa** (`order=<pk>`), para que la paginación sea determinística.
- Con `Prefer: count=exact` la API devuelve `Content-Range: 0-999/41344` y status **206** si la respuesta es parcial (200 si entra completa; `*/0` si no hay filas).
- Verificaciones del cliente (`src/ingest/client.ts`), todas → error de **datos**:
  - falta `Content-Range` o no trae total;
  - el rango no coincide con el `offset` pedido o con la cantidad de filas recibidas;
  - el total cambia entre páginas (publicación en curso);
  - página vacía antes de completar el total;
  - filas acumuladas ≠ total informado.
- Reintentos: 5xx, 429, 408, timeouts y errores de red, hasta `INDEC_MAX_RETRIES` (4) con backoff exponencial + jitter (0,5 s × 2^n, tope 30 s) o `Retry-After` (tope 120 s). 401/403 (`auth`), 404 (`config`) y otros 4xx (`data`) no se reintentan.
- Caché de respuestas crudas por URL (SHA-256, gzip) en `data/cache/` con TTL `INDEC_CACHE_TTL_HOURS` (6 h). `--no-cache` la ignora (pero escribe lo nuevo). Si una inconsistencia de paginación involucra páginas de caché, la consulta se repite sin caché.

## Períodos

| Dataset | Columna cruda | Ejemplo | Canónico | Verificación |
|---|---|---|---|---|
| Mensuales | `periodo` (`Periodo` en comercio) | `202409` | `2024-09` | contra `anio`/`mes` (`Anio`/`Mes`) |
| EPH tasas | `periodo` | `20162T` | `2016-Q2` | contra `anio`/`trimestre` |
| EPH pobreza | `periodo` | `20261S` | `2026-S1` | contra `anio`/`semestre` |

Una incoherencia entre la columna cruda y año/mes aborta el dataset (error de datos). En 2026-11-04 no hubo ninguna.

## Faltantes, signos y columnas `_null` (no documentadas)

Las respuestas incluyen, por cada columna de valor, una columna `<col>_null` **que no figura en el OpenAPI**: contiene el signo convencional que explica por qué el valor es nulo. Observado:

| Signo | Significado (`ObservationFlag`) | Dónde se observó | Qué trae `valor` |
|---|---|---|---|
| `///` | no corresponde (`no_corresponde`) | variaciones sin período de comparación (EMAE, IPC, salarios, ICC, SIPM, CBA/CBT, IPI); índice de salarios antes de la base (oct-2015 a sep-2016 para nivel general y no registrado) | `null` |
| `s` | confidencial / secreto estadístico (`confidencial`) | comercio exterior por país (exportaciones desde 2018-01: 99.199 celdas; importaciones: ninguna); IPI manufacturero (neumáticos, otros productos de caucho); IPI minero | `null` |
| `-` | cero absoluto (`cero_absoluto`) | IPI manufacturero, var. interanual de "Preparación de hojas de tabaco" (36 filas, producción estacional nula) | **`null`** (la API no informa 0) |
| `*`, `**`, `e`, `i`, `u`, `.`, `...` | provisorio, preliminar, estimado, imputado, calidad inferior, no registrado, no disponible | no observados en `_null` a la fecha; el mapeo está implementado | — |

Reglas de normalización (`src/ingest/normalize.ts`):

- Faltante = `null`, **nunca 0**. Para `-` (cero absoluto) la API entrega `valor: null`; se conserva `null` + flag `cero_absoluto` (no se imputa 0 porque la fuente no lo informa como valor).
- El texto de `observaciones` se guarda en `rawNote` y se interpretan flags: `"* Dato provisorio"` (ICC, SIPM) y `"Dato provisorio"` (EPH) → `provisorio`; `"**…"`/"preliminar" → `preliminar`. Las notas de cobertura de la EPH ("…no incluyen el aglomerado Gran Resistencia", "…formalidad … a partir del cuarto trimestre de 2023") quedan en `rawNote` (son por fila, así que aplican a todas las tasas de ese trimestre). En IPC, `observaciones` solo trae notas de variedades de producto (no se usan).
- Se recortan los nulos al inicio y al final de cada serie (períodos en que la serie no existe, p.ej. `///` antes de la base, o `tasa_de_empleo_formal` nula sin signo antes de 2023-Q4). Los nulos intermedios se conservan con su flag.
- Series agregadas (`aggregate: 'sum'`, comercio exterior): suma de las filas con valor; las filas nulas (`s`) se cuentan en `meta.suppressedRows` (en modo ventana, solo las de la ventana descargada) y **no se tratan como cero**. Si todas las filas de un período son nulas, el valor es `null` con el flag correspondiente. Los totales por período reproducen lo publicado: sep-2024 exportaciones 6.952,88 M USD y importaciones 5.970,96 M USD; la suma de rubros (incluido el 9 "CONFIDENCIAL") y de usos económicos da exactamente el total. Las series por país excluyen las celdas confidenciales (pueden subestimar).
- Duplicados (más de una fila por serie y período sin agregación) o selectores sin filas → error de datos de esa serie; se conserva el dato anterior.

## Metadatos de publicación y detección de revisiones

La API **no expone fecha de publicación, versión, ni marca de revisión** (no hay `ETag` ni `Last-Modified` útiles; los únicos indicios son los signos `*`/"Dato provisorio"). Por eso:

- `meta.publishedAt` queda en `null`; `meta.retrievedAt` es el momento de la consulta.
- Las revisiones se detectan **comparando cada corrida contra el store** (`src/ingest/revisions.ts`), con tolerancia relativa 1e-9:
  - `revised`: el valor de un período cambió (incluye número ↔ null);
  - `added_historical`: aparece un período dentro del rango ya almacenado;
  - `removed`: desaparece un período almacenado;
  - los períodos nuevos posteriores al último almacenado **no** son revisiones (publicación normal).
- Se registran en `data/store/revisions.jsonl` (append-only). La primera carga no genera revisiones.
- Datasets completos (todos salvo comercio): se comparan en toda la historia en cada corrida (capta las re-estimaciones de las series desestacionalizadas de EMAE e IPI).
- Comercio exterior: la corrida diaria compara la ventana de 24 meses; la reconciliación completa (cada 30 días o con `--full`) compara toda la historia desde 1986.

## Resultados de las corridas reales (2026-11-04)

| Corrida | Requests | Filas | Duración aprox. | Resultado |
|---|---:|---:|---:|---|
| 1.ª (`npm run data:refresh`, store vacío) | 1.172 (85 de caché) | 1.248.444 (comercio completo: 779.536 + 390.315) | ~6 min | 139/139 series OK, 0 errores |
| 2.ª (`-- --no-cache`, comercio por ventana) | 152 | 143.115 (comercio: 41.491 + 23.031) | ~45 s | 139/139 OK, **0 revisiones**, observaciones idénticas en las 139 series (idempotencia) |
| `npm run data:check` | — | — | — | 134/134 series API: exactamente 1 fila por período (≥ 1 en agregadas), sin huecos ni nulos intermedios |
