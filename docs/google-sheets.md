# Google Sheets — configuración y funcionamiento

El conector (`src/sheets/`) escribe 4 documentos a partir del store normalizado (`data/store/`):

| Tema | Documento | Gráfico de ejemplo |
|---|---|---|
| `actividad` | Argentina — Actividad | EMAE desestacionalizado (`DATOS_EMAE_M`) |
| `laboral` | Argentina — Mercado laboral | Tasa de desocupación, trimestral (`DATOS_EPH_TASAS_Q`) |
| `precios` | Argentina — Precios | IPC nacional var. % m/m (`CALCULOS_IPC_NIVEL_GENERAL_M`) |
| `comex` | Argentina — Comercio exterior | Exportaciones e importaciones (`DATOS_COMERCIO_TOTALES_M`) |

Comandos:

```powershell
npm run sheets:auth                     # OAuth de usuario, una sola vez
npm run sheets:sync                     # sincroniza los 4 documentos
npm run sheets:sync -- --dry-run        # vista previa local, sin tocar Google
npm run sheets:sync -- --topic=precios  # solo un tema (lista separada por comas)
npm run sheets:sync -- --allow-synthetic  # permite subir datos SINTÉTICOS (no recomendado)
```

## 1. Elegir el modo de autenticación

| | OAuth de usuario (`GOOGLE_AUTH_MODE=oauth`) — **recomendado** | Cuenta de servicio (`GOOGLE_AUTH_MODE=service_account`) |
|---|---|---|
| Quién es el dueño de los documentos | Vos (Mi unidad) | Vos: los creás a mano y los compartís |
| Crea documentos | Sí, automáticamente la primera vez | **No** (la cuenta de servicio no tiene cuota de Drive propia) |
| Cuándo usarlo | Uso personal/equipo, PC del usuario, tarea programada local | Servidor sin usuario interactivo, o si la organización prefiere una identidad técnica |
| Riesgo corporativo | El admin de Workspace puede bloquear apps OAuth externas (ver abajo) | La política de la organización puede **bloquear la creación de claves** de cuentas de servicio (`iam.disableServiceAccountKeyCreation`) |

### Scopes

- OAuth: `https://www.googleapis.com/auth/spreadsheets` (leer/escribir los 4 documentos, incluso si los creaste a mano y pasaste su ID en `SHEETS_ID_*`; `drive.file` solo no alcanzaría para esos) y `https://www.googleapis.com/auth/drive.file` (acceso de Drive **solo a archivos creados/abiertos por esta app**; se usa para detectar si un documento propio está en la papelera, porque la API de Sheets sigue escribiendo en archivos en la papelera). No se pide acceso a todo Drive.
- Cuenta de servicio: solo `spreadsheets`.

## 2a. OAuth de usuario — paso a paso

1. En [Google Cloud Console](https://console.cloud.google.com/) elegí (o creá) un proyecto **de tu organización**.
2. *APIs y servicios → Biblioteca*: habilitá **Google Sheets API** y **Google Drive API**.
3. *APIs y servicios → Pantalla de consentimiento de OAuth*:
   - Tipo de usuario **Interno** (solo cuentas de tu Google Workspace). Esto evita la verificación de Google y las restricciones que el admin suele aplicar a apps **externas**. Si tu cuenta no permite "Interno" (cuenta personal), usá "Externo" en modo *Prueba* y agregate como usuario de prueba (en ese modo el refresh token vence a los 7 días).
   - Agregá los scopes `.../auth/spreadsheets` y `.../auth/drive.file`.
4. *Credenciales → Crear credenciales → ID de cliente de OAuth → Tipo: **App de escritorio*** (Desktop app).
5. Copiá el ID y el secreto a `.env`:
   ```
   GOOGLE_AUTH_MODE=oauth
   GOOGLE_OAUTH_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=...
   GOOGLE_OAUTH_TOKEN_PATH=.secrets/google-oauth-token.json
   ```
6. `npm run sheets:auth`
   - Levanta un servidor efímero en `http://127.0.0.1:<puerto libre>` (flujo *loopback*, con PKCE y `state`).
   - Abre el navegador (en Windows con `cmd /c start`); si no se abre, copiá la URL que se imprime.
   - Iniciá sesión con tu cuenta corporativa, aceptá **ambos** permisos. El navegador muestra "Autorización completa".
   - Se guarda **solo el refresh token** en `.secrets/google-oauth-token.json` (gitignored, permisos 0600). Plazo máximo: 5 minutos.
7. `npm run sheets:sync` → crea los 4 documentos en tu Mi unidad (la primera vez) y guarda sus IDs en `config/sheets.local.json` (gitignored). Las corridas siguientes reutilizan esos IDs.

Errores frecuentes:
- `admin_policy_enforced` / "Esta app está bloqueada": el admin de Workspace restringe apps OAuth de terceros. Solución: pantalla de consentimiento **Interna** en un proyecto de Google Cloud de la organización, o pedir al admin que marque el cliente como confiable (*Admin console → Seguridad → Controles de API → Acceso de apps de terceros*).
- "no devolvió refresh token": revocá el acceso en <https://myaccount.google.com/permissions> y repetí `sheets:auth`.
- `invalid_grant` en `sheets:sync`: el refresh token fue revocado o venció (modo *Prueba*). Repetí `sheets:auth`.

Si preferís usar documentos creados a mano también con OAuth, poné sus IDs (o URLs) en `SHEETS_ID_*`: tienen prioridad sobre `config/sheets.local.json`.

## 2b. Cuenta de servicio — paso a paso

1. En el proyecto de Google Cloud: habilitá **Google Sheets API**.
2. *IAM → Cuentas de servicio → Crear*. No necesita roles de proyecto.
3. *Claves → Agregar clave → JSON*. Guardala fuera del repo o en `.secrets/` (gitignored). Si aparece "La creación de claves está inhabilitada", la política de la organización lo bloquea: usá OAuth o pedí una excepción al admin.
4. En Google Drive creá **vos** los 4 documentos vacíos (títulos de la tabla de arriba), y en cada uno *Compartir* → email de la cuenta de servicio (`...@...iam.gserviceaccount.com`) como **Editor**.
5. En `.env`:
   ```
   GOOGLE_AUTH_MODE=service_account
   GOOGLE_SERVICE_ACCOUNT_KEY_FILE=.secrets/service-account.json
   SHEETS_ID_ACTIVIDAD=<ID o URL>
   SHEETS_ID_LABORAL=...
   SHEETS_ID_PRECIOS=...
   SHEETS_ID_COMEX=...
   ```
6. `npm run sheets:sync`. La pestaña inicial ("Hoja 1") no se toca: podés borrarla a mano.

## 3. Qué administra el sistema y qué podés editar

**Pestañas gestionadas** (se reescriben en cada sincronización; identificadas por developer metadata `indec_monitor_tab` = clave de pestaña, visibilidad DOCUMENT):

| Pestaña | Rango gestionado |
|---|---|
| `LEEME`, `CATALOGO`, `CONTROL`, `EJEMPLO_GRAFICO` | Toda la pestaña (valores) |
| `DATOS_<FAMILIA>_<M\|Q\|S>`, `CALCULOS_<FAMILIA>_<M\|Q\|S>` | Columnas A..última columna gestionada, todas las filas. Lo que haya a la derecha no se compara ni se borra (pero una serie nueva ocupará la próxima columna libre) |

Nombres/prefijos reservados: `LEEME`, `CATALOGO`, `CONTROL`, `DATOS_`, `CALCULOS_`, `EJEMPLO_GRAFICO`, `GRAFICOS_USUARIO`. Si existe una pestaña con ese nombre sin metadata, el sistema la **adopta**.

**Lo que nunca se toca:** `GRAFICOS_USUARIO` (se crea una sola vez; si la borrás o renombrás, no se recrea — flag `indec_monitor_user_tab_created`), cualquier pestaña tuya con otro nombre, todos los gráficos (también los que pongas sobre pestañas gestionadas), notas/comentarios de celda, formatos que agregues fuera de lo gestionado, el orden de las pestañas, los `sheetId`.

**Nunca se hace:** borrar o recrear el documento, borrar pestañas, borrar filas/columnas (`deleteDimension`), borrar gráficos, fórmulas `IMPORTXML`, una request por celda.

### Estructura de las pestañas de datos (mapeo estable de columnas)

```
fila 1  fecha | actividad.emae.total.sa|level | ...      ← ID técnico de columna (columnKey de src/core/views.ts)
fila 2  Fecha | EMAE desest. (Índice base 2004=100) | ...  ← encabezado legible
fila 3+ 45292 | 152,3 | ...                               ← fecha = serial de Sheets (formato "mmm yyyy"), valores numéricos
```

- Fecha = primer día del período (`periodToSheetsSerial`): trimestre 2 → 1-abr; semestre 2 → 1-jul.
- Una fila por período, continuo y ascendente (un período sin dato = celda vacía, nunca 0). Valores sin redondear (formato visible `#,##0.00`).
- Filas 1–2 y columna A congeladas. Sin celdas combinadas.
- El **orden de columnas se lee de la fila 1**: las claves existentes conservan su posición, las nuevas se agregan al final, las retiradas del registro se conservan con el prefijo `[RETIRADA] ` y sus valores (alineados por fecha). No edites la fila 1.
- `CALCULOS_*` contiene **valores** (no fórmulas) calculados con `buildWideTable` + `defaultCalcTransforms`: son exactamente los mismos números que el dashboard.
- Para graficar: rangos abiertos desde la fila 2, p.ej. `DATOS_EMAE_M!A2:A` y `C2:C` (encabezado = fila 2). Así el gráfico toma solos los períodos nuevos.

### Otros metadatos

- Spreadsheet: `indec_monitor_topic` (evita escribir un tema en el documento de otro), `indec_monitor_example_chart` (chartId del gráfico de ejemplo; si lo borrás, se recrea en la próxima corrida con el mismo ID).
- Locale `es_AR` y zona `America/Argentina/Buenos_Aires` (se fijan si difieren).

## 4. Cómo funciona una sincronización (idempotente)

1. `spreadsheets.get` (solo propiedades, metadata y charts) y `values.batchGet` de las pestañas gestionadas (UNFORMATTED_VALUE, fechas como serial).
2. Plan puro (`layout.ts`): pestañas, columnas (respetando el orden existente) y valores.
3. `spreadsheets.batchUpdate` con lo estructural mínimo: pestañas faltantes (con `sheetId` determinístico), metadata, expansión de grilla, formatos solo si la pestaña es nueva o creció.
4. `values.batchUpdate` (RAW) **solo para pestañas cuyo contenido difiere**; `values.batchClear` para filas sobrantes dentro del rango gestionado.
5. Gráfico de ejemplo: se crea si falta (`chartId` determinístico guardado en metadata), con rangos de columna completos abiertos.

Correr dos veces seguidas no escribe nada salvo `CONTROL` (hora de sincronización). Los reintentos de requests son seguros: los IDs determinísticos hacen que un `addSheet`/`addChart` repetido falle en lugar de duplicar.

### Límites contemplados

- ~10 MB por request: las escrituras se trocean en bloques de filas de ≤ 2 MB (`LIMITS.maxRequestBytes`); `batchUpdate` en lotes de ≤ 500 requests.
- 10 M de celdas por libro: se valida antes de escribir. Las pestañas nuevas se crean con el tamaño justo (no 1000×26).
- Cuotas (60 escrituras/min/usuario): una sincronización completa usa ~4–6 llamadas por documento. Ante 429/5xx/errores de red: backoff exponencial con jitter (hasta 6 reintentos), respetando `Retry-After`.
- Rangos por `values.batchGet`: de a 25 (van en la URL).

## 5. Datos sintéticos y desactualizados

- Si el manifest tiene `dataMode: 'synthetic'` (o alguna serie `meta.synthetic`), `LEEME` y `CONTROL` lo indican en forma destacada y **`sheets:sync` se niega a escribir en Google** salvo `--allow-synthetic`.
- Series `stale` (la última ingesta falló y quedan datos anteriores) o con error se listan en `CONTROL` y se advierten en `LEEME`.
- `CONTROL` también muestra: última sincronización, última ingesta (runId, inicio, fin, resultado), estado por dataset, cobertura por serie (primer/último período, filas, no nulos, consultado), revisiones recientes (últimas 100 de `revisions.jsonl`), pestañas de datos y columnas retiradas.

## 6. Vista previa local (`--dry-run`)

Sin credenciales (ninguna variable de Google configurada) `sheets:sync` cae solo en este modo. Si la configuración está **a medias** (p.ej. cliente OAuth cargado pero sin `sheets:auth`), en cambio, termina con error y te indica el paso faltante.

```powershell
$env:DATA_MODE='fixtures'; npm run sheets:sync -- --dry-run   # PowerShell
DATA_MODE=fixtures npm run sheets:sync -- --dry-run            # bash
```

Genera `data/sheets-preview/<tema>/` (gitignored; `SHEETS_PREVIEW_DIR` para cambiarlo):
- `<PESTAÑA>.csv`: valores exactos que se escribirían (UTF-8 con BOM; fechas como serial de Sheets: en Excel, formato de fecha).
- `requests.json`: llamadas que se harían en una **primera** sincronización (batchUpdate, values.batchUpdate), metadata, gráficos y resumen. Se obtiene corriendo el writer real contra una simulación en memoria de la API.

## 7. Agregar una serie

1. Agregar el `SeriesDef` en `src/core/registry/<tema>.ts` (ver `docs/agregar-serie.md`). El ID es la clave de columna: **nunca renombrarlo**.
2. `npm run data:refresh` y `npm run sheets:sync`.
3. Resultado: columna nueva **al final** de `DATOS_<FAMILIA>_<FREC>` (y sus transformaciones al final de `CALCULOS_*`); si la familia/frecuencia es nueva, se crea una pestaña nueva al final del documento. Fila nueva en `CATALOGO`. Nada existente se mueve.
4. Quitar una serie del registro no borra su columna: queda marcada `[RETIRADA]` con sus últimos valores.

## 8. Archivos

| Archivo | Rol |
|---|---|
| `src/sheets/layout.ts` | Plan puro de pestañas/columnas/valores por tema |
| `src/sheets/writer.ts` | Aplica el plan en forma idempotente (diff, troceo, gráfico) |
| `src/sheets/client.ts` | API real (googleapis) con reintentos y errores saneados |
| `src/sheets/memory.ts` | Simulación en memoria de la API (tests y `--dry-run`) |
| `src/sheets/auth.ts`, `src/sheets/cli/auth.ts` | Credenciales y flujo OAuth loopback |
| `src/sheets/config.ts` | IDs de documentos (`SHEETS_ID_*` > `config/sheets.local.json`) |
| `src/sheets/preview.ts` | Vista previa local |
| `src/sheets/cli/sync.ts` | CLI `sheets:sync` |
| `tests/sheets/` | Tests con la API simulada |
