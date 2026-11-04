# CLAUDE.md — Monitor macro Argentina (API INDEC → Google Sheets + dashboard)

Idioma del proyecto: **español** (UI, docs, mensajes de CLI, nombres de pestañas). Código e identificadores en inglés/español técnico según ya existe.

## Arquitectura (una sola capa de datos)

```
API INDEC (JWT) ─▶ src/ingest (cliente, paginación, normalización, revisiones)
                     └─▶ data/store (JSON normalizado + manifest + revisions.jsonl)
                            ├─▶ src/sheets  (4 Google Sheets, escritura por lotes)
                            └─▶ src/app + src/web (dashboard Next.js → sitio estático out/ → GitHub Pages)
```

- `src/core/` — **contratos compartidos**. Cambios acá afectan a ingesta, Sheets y dashboard.
  - `types.ts` (modelo), `periods.ts` (períodos canónicos), `transforms.ts` (ÚNICA implementación de transformaciones económicas), `views.ts` (tablas anchas compartidas), `datasets.ts` (endpoints), `registry/` (series), `store.ts` (persistencia).
- El navegador **nunca** recibe el token de INDEC ni credenciales de Google. Nada de `NEXT_PUBLIC_` para secretos. `src/core/store.ts` usa `node:fs`: solo servidor/CLI.

## Reglas económicas (no negociables)

- Período de referencia ≠ fecha de publicación ≠ fecha de consulta (`retrievedAt`).
- Faltante = `null`, nunca 0. No interpolar, no arrastrar, no redondear lo almacenado.
- Comparaciones por calendario (`shiftPeriod`), nunca por posición de fila.
- No mezclar frecuencias, ajustes estacionales ni bases. Sin desestacionalización propia.
- Tasas → diferencias en p.p.; saldos → diferencias absolutas; índices/flujos → %.
- Variación m/m o t/t de **actividad** solo sobre serie desestacionalizada (`allowedTransforms`).
- Ventas/valores nominales no son volumen. Comercio exterior: USD corrientes, X FOB, M CIF.
- EPH = 31 aglomerados urbanos, no total nacional.
- Incidencias: usar las publicadas; no ponderador × variación.

## Convenciones

- IDs de serie estables `<tema>.<familia>.<apertura>[.<ajuste>]`: **nunca renombrar** (son claves de columnas en Sheets).
- Período canónico: `2024-03`, `2024-Q1`, `2024-S1`, `2024`. Fecha representativa = primer día del período.
- Selectores del registro = valores exactos de columnas de la API (verificados con `npm run data:check`).
- Fixtures sintéticos solo en `data/store-fixtures/` (`DATA_MODE=fixtures`), siempre marcados `synthetic`.
  Respuestas reales mínimas para tests en `tests/fixtures/real/` (sin credenciales).
- Escrituras de archivos atómicas (`writeJsonAtomic`). Ingesta con lock (`data/.lock`).
- Secretos solo en `.env` / `.secrets/` (gitignored). Nunca loguear tokens ni ponerlos en URLs.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run data:refresh` | Descarga y normaliza (incremental + revisiones). `-- --full` fuerza reconciliación completa |
| `npm run data:discover` | Lista dimensiones reales por endpoint (docs/catalogo-dimensiones.md) |
| `npm run data:check` | Verifica que cada selector del registro identifique exactamente 1 serie |
| `npm run sheets:auth` | OAuth de usuario (una vez) |
| `npm run sheets:sync` | Escribe los 4 Google Sheets. `-- --dry-run` genera vista previa local |
| `npm run dev` / `build` / `start` | Dashboard: desarrollo / sitio estático en `out/` / servir `out/` |
| `npm run test` | Vitest |
| `npm run fixtures:generate` | Store sintético para desarrollo |

## Estado y documentación

- Estado vivo del proyecto: `docs/estado.md` (avances, bloqueos, próximos pasos). Actualizar al cerrar cada tarea.
- Cobertura por indicador: `docs/cobertura.md`. Metodología: `docs/metodologia.md`.
- Agregar una serie: `docs/agregar-serie.md`.
