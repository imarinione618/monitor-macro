# Monitor macro Argentina

Sistema de monitoreo macroeconómico de Argentina con **datos oficiales del INDEC** (Catálogo API-INDEC), con dos productos que se alimentan de una misma capa de datos:

1. **Cuatro Google Sheets por tema**, base para gráficos de presentaciones: *Argentina — Actividad*, *Mercado laboral*, *Precios* y *Comercio exterior*.
2. **Un dashboard web** (Next.js + ECharts), publicado como sitio estático en **https://imarinione618.github.io/monitor-macro/**. Se genera desde los datos normalizados: no depende de Google Sheets ni expone el token del INDEC al navegador.

```
API INDEC (JWT) ─▶ ingesta + normalización + revisiones ─▶ data/store (JSON)
                                                             ├─▶ Google Sheets (4 documentos)
                                                             └─▶ Dashboard web
```

Las transformaciones económicas (variaciones, acumulados, base 100, salario real) se calculan **una sola vez**, en `src/core/transforms.ts`. Por eso Sheets y el dashboard muestran exactamente el mismo número para la misma serie, período y transformación.

## Requisitos

- Node.js ≥ 20.10 (probado con 24) y npm.
- Token JWT de la API de INDEC: registrarse en https://api.indec.gob.ar/ → perfil → generar token.
- Para Sheets: un cliente OAuth "App de escritorio" de Google Cloud (ver `docs/google-sheets.md`).

> **Windows / PowerShell:** si `npm` da "la ejecución de scripts está deshabilitada", usá `npm.cmd` (por ejemplo `npm.cmd run dev`) o abrí *Símbolo del sistema* (cmd). No hace falta cambiar la política de seguridad.

## Instalación

```bash
npm ci                      # o npm install
cp .env.example .env        # completar INDEC_API_TOKEN (y Google, para Sheets)
npm run data:refresh        # descarga y normaliza (~6 min la primera vez; comercio exterior es grande)
npm run data:check          # verifica que cada serie del registro esté bien identificada
npm run dev                 # dashboard en http://localhost:3000
```

Para Google Sheets, una sola vez:

```bash
npm run sheets:auth         # abre el navegador para autorizar con tu cuenta
npm run sheets:sync         # crea (1.ª vez) o actualiza los 4 documentos
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run data:refresh` | Ingesta incremental con detección de revisiones. Flags: `-- --full` (reconciliación completa), `-- --dataset <id>`, `-- --no-cache` |
| `npm run data:check` | Verifica contra la API que cada selector identifique exactamente una serie por período |
| `npm run data:discover` | Releva dimensiones reales de cada endpoint → `docs/catalogo-dimensiones.md` |
| `npm run sheets:auth` | Autorización OAuth de Google (una vez) |
| `npm run sheets:sync` | Sincroniza los 4 Google Sheets. `-- --dry-run`: vista previa local en `data/sheets-preview/`. `-- --topic=precios` |
| `npm run update` | `data:refresh` + `sheets:sync` |
| `npm run dev` | Dashboard en modo desarrollo (lee los datos en cada recarga) |
| `npm run build` / `npm start` | Genera el sitio estático en `out/` / lo sirve en http://localhost:3000 |
| `npm run test` | Pruebas (vitest) |
| `npm run lint` | Chequeo de tipos (`tsc --noEmit`) |
| `npm run fixtures:generate` | Store **sintético** para desarrollo (`DATA_MODE=fixtures`; el dashboard muestra un aviso) |

## Dashboard compartido

El dashboard se publica en **https://imarinione618.github.io/monitor-macro/**.

- **Cómo se actualiza:** la tarea diaria actualiza los datos y los sube a este repositorio (`data/store`). GitHub Actions (`.github/workflows/pages.yml`) corre las pruebas, regenera el sitio y lo publica. GitHub no necesita ningún secreto.
- **Verlo localmente:** `npm run build && npm start`.

## Actualización automática

- **Manual:** `powershell -ExecutionPolicy Bypass -File scripts/update.ps1`. Hace ingesta, Sheets y publicación (commit y push de `data/store`) y deja un log en `data/runs/`. `npm run update` hace solo ingesta y Sheets.
- **Diaria en este equipo:** `powershell -ExecutionPolicy Bypass -File scripts/schedule-windows.ps1 -Time 08:30`. Registra una tarea en el Programador de tareas; es idempotente. Para ver el estado: `-Status`; para quitarla: `-Unregister`.
  - **Solo corre con el equipo encendido.** Si a esa hora estaba apagado, corre al encenderlo.
- **Con el equipo apagado:** plantilla de GitHub Actions en `deploy/github-actions/update.yml`. Ver `docs/despliegue.md`.

## Estructura

```
src/core/      contratos compartidos: tipos, períodos, transformaciones, registro de series, store
src/ingest/    cliente API INDEC, paginación, normalización, revisiones, CLI
src/sheets/    conector Google Sheets (auth, plan de pestañas, escritura idempotente)
src/app/       páginas del dashboard (Next.js App Router)
src/web/       componentes y lógica del dashboard
data/store/    datos normalizados (versionables) + manifest + revisions.jsonl
docs/          documentación (ver abajo)
scripts/       actualización y programación en Windows
deploy/        plantilla de GitHub Actions
tests/         pruebas: core, ingest, sheets, web, validation (+ fixtures reales mínimas)
```

## Documentación

| Documento | Contenido |
|---|---|
| `docs/api-auditoria.md` | Auditoría de la API: endpoints, autenticación, paginación, signos, revisiones |
| `docs/cobertura.md` | Cobertura por indicador: identificador real, frecuencia, rango, estado y limitaciones |
| `docs/catalogo-dimensiones.md` | Valores reales de las dimensiones por endpoint |
| `docs/metodologia.md` | Modelo de datos, reglas, fórmulas y criterios por tema |
| `docs/google-sheets.md` | Credenciales, pestañas y rangos administrados, qué podés editar |
| `docs/dashboard.md` | Pantallas, gráficos, exportaciones |
| `docs/validacion.md` | Contraste con publicaciones oficiales y verificaciones |
| `docs/despliegue.md` | Ejecución local, programación y opciones de despliegue |
| `docs/agregar-serie.md` | Cómo agregar una serie |
| `docs/estado.md` | Estado actual, bloqueos y próximos pasos |
| `CLAUDE.md` | Convenciones del proyecto |

## Seguridad

- Los secretos van solo en `.env` y `.secrets/`, ambos excluidos de git. `.env.example` no tiene valores reales.
- El token de INDEC se usa únicamente en procesos de servidor o CLI. Nunca se loguea ni va en URLs, y hay una prueba que verifica que no aparezca en el bundle del navegador.
