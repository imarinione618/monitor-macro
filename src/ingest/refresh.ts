/**
 * Orquestación de la ingesta: API INDEC → store normalizado (data/store).
 *
 *  1. Lock de ejecución (data/.lock).
 *  2. Por dataset: modo completo o por ventana (DATASETS.refreshMode, revisionWindowMonths,
 *     fullReconcileDays, --full); descarga paginada y verificada; normalización por serie;
 *     validación; detección de revisiones; escritura atómica.
 *     Si un dataset falla, sus series conservan el último dato válido y quedan `stale`.
 *  3. Nomenclaturas de comercio exterior.
 *  4. Series derivadas (salario real, saldo comercial) con src/core/transforms.ts.
 *  5. Manifest (estado por dataset y por serie), revisions.jsonl y resumen de la corrida.
 *
 * Idempotente: dos corridas seguidas sin cambios en la fuente solo actualizan
 * timestamps (retrievedAt/runId) y no agregan revisiones.
 */
import path from 'node:path';
import crypto from 'node:crypto';
import { DATASETS } from '../core/datasets';
import { SERIES, dependenciesOf } from '../core/registry';
import { comparePeriods, currentMonthBA, shiftPeriod } from '../core/periods';
import {
  appendRevisions,
  emptyManifest,
  readManifest,
  readSeriesData,
  storeDir as defaultStoreDir,
  writeJsonAtomic,
  writeManifest,
  writeNomenclaturas,
  writeSeriesData,
} from '../core/store';
import type {
  DatasetConfig,
  DatasetId,
  DatasetRunStatus,
  ErrorKind,
  Manifest,
  Observation,
  Period,
  RevisionRecord,
  SeriesData,
  SeriesDef,
} from '../core/types';
import type { IndecClient } from './client';
import { IngestError, toIngestError } from './errors';
import { fetchDatasetRows } from './fetch-dataset';
import { buildApiSeries, buildDerivedSeries, indexRows, validateObservations, type IndexedRow } from './normalize';
import { countNewPeriods, detectRevisions, mergeWindow } from './revisions';
import { acquireLock } from './lock';
import { DEFAULT_LOADERS, feedConfig, type FeedLoader } from './external';
import type { ExternalSourceSpec, FeedRunStatus } from '../core/types';

export const NOMENCLATURAS_ID: DatasetId = 'comercio_exterior_nomenclaturas';

export interface RefreshOptions {
  client: IndecClient;
  /** Fuerza reconciliación completa de los datasets por ventana. */
  full?: boolean;
  /** Limita la corrida a estos datasets (default: todos los requeridos por el registro). */
  datasets?: DatasetId[];
  storeDir?: string;
  lockFile?: string;
  /** Directorio para el resumen JSON de la corrida (null = no escribir). */
  runsDir?: string | null;
  series?: SeriesDef[];
  datasetConfigs?: Record<DatasetId, DatasetConfig>;
  /** Incluir nomenclaturas de comercio (default: sí, salvo que el filtro de datasets las excluya). */
  nomenclaturas?: boolean;
  now?: () => Date;
  log?: (msg: string) => void;
  lockStaleMs?: number;
  /** En modo completo, una serie que pierde más de esta fracción de valores se rechaza. */
  minRetainRatio?: number;
  /** No consultar la API INDEC (solo fuentes externas y derivadas). */
  skipIndec?: boolean;
  /** Fuentes externas a actualizar (default: todas las del registro, salvo que se filtren datasets INDEC). */
  feeds?: string[];
  /** Cargadores por tipo de feed (tests). */
  feedLoaders?: Partial<Record<string, FeedLoader>>;
  /** fetch para fuentes externas (tests). */
  fetch?: typeof fetch;
}

export interface DatasetOutcome {
  dataset: DatasetId;
  ok: boolean;
  mode: 'full' | 'windowed';
  modeReason: string;
  windowStart?: Period;
  rows: number;
  totalRows: number | null;
  pages: number;
  pagesFromCache: number;
  seriesOk: number;
  seriesFailed: number;
  error?: { kind: ErrorKind; message: string; httpStatus?: number };
  durationMs: number;
}

export interface SeriesOutcome {
  id: string;
  ok: boolean;
  stale: boolean;
  newPeriods: number;
  /** true si no había datos almacenados (primera carga). */
  firstLoad?: boolean;
  revisions: number;
  count: number;
  firstPeriod: Period | null;
  lastPeriod: Period | null;
  error?: string;
  warnings?: string[];
}

export interface RefreshSummary {
  runId: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  partial: boolean;
  datasets: DatasetOutcome[];
  series: SeriesOutcome[];
  revisions: RevisionRecord[];
  errors: string[];
}

export function newRunId(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${crypto.randomBytes(2).toString('hex')}`;
}

const fmt = (n: number) => n.toLocaleString('es-AR');

function nonNullCount(obs: Observation[] | null | undefined): number {
  return (obs ?? []).reduce((a, o) => a + (o.value === null ? 0 : 1), 0);
}

export async function runRefresh(opts: RefreshOptions): Promise<RefreshSummary> {
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? ((m: string) => console.log(m));
  const dir = opts.storeDir ?? defaultStoreDir();
  const allSeries = opts.series ?? SERIES;
  const dsConfigs = opts.datasetConfigs ?? DATASETS;
  const minRetain = opts.minRetainRatio ?? 0.5;
  const started = now();
  const runId = newRunId(started);
  const startedAt = started.toISOString();

  if (process.env.DATA_MODE === 'fixtures' && !opts.storeDir) {
    throw new IngestError('config', 'DATA_MODE=fixtures: la ingesta real no escribe en el store sintético. Quitar DATA_MODE o usar DATA_MODE=real.');
  }

  const lockFile = opts.lockFile ?? path.join(path.dirname(dir), '.lock');
  const release = acquireLock(lockFile, { runId, staleMs: opts.lockStaleMs, now: () => now().getTime(), log });
  try {
    const manifest: Manifest = readManifest(dir) ?? emptyManifest('real');
    if (manifest.dataMode !== 'real') throw new IngestError('config', `El store ${dir} es sintético (dataMode=${manifest.dataMode}); no se mezcla con datos reales.`);

    const apiSeries = allSeries.filter((s) => s.source.kind === 'api');
    const required = [...new Set(apiSeries.map((s) => (s.source as { dataset: DatasetId }).dataset))];
    const targets = opts.skipIndec ? [] : opts.datasets?.length ? required.filter((d) => opts.datasets!.includes(d)) : required;
    const unknown = (opts.datasets ?? []).filter((d) => !dsConfigs[d]);
    if (unknown.length) throw new IngestError('config', `Dataset(s) desconocido(s): ${unknown.join(', ')}`);
    const doNomen = !opts.skipIndec && (opts.nomenclaturas ?? (!opts.datasets?.length || opts.datasets.includes(NOMENCLATURAS_ID)));

    log(`== Ingesta INDEC — corrida ${runId}`);
    log(`   Store: ${dir}${opts.full ? ' · reconciliación completa forzada (--full)' : ''}`);
    log(`   Datasets: ${targets.length}${doNomen ? ' + nomenclaturas' : ''} · series del registro: ${allSeries.length}`);

    const datasetOutcomes: DatasetOutcome[] = [];
    const seriesOutcomes: SeriesOutcome[] = [];
    const allRevisions: RevisionRecord[] = [];
    const errors: string[] = [];

    const setSeriesManifest = (id: string, data: SeriesData | null, stale: boolean, error?: string) => {
      const obs = data?.observations ?? [];
      manifest.series[id] = {
        firstPeriod: obs[0]?.period ?? null,
        lastPeriod: obs[obs.length - 1]?.period ?? null,
        count: obs.length,
        retrievedAt: data?.meta.retrievedAt ?? null,
        stale,
        ...(error ? { error } : {}),
      };
    };

    /** Conserva el último dato válido y lo marca como desactualizado. */
    const markStale = (def: SeriesDef, error: string): SeriesOutcome => {
      const old = readSeriesData(def.id, dir);
      if (old) {
        const upd: SeriesData = { ...old, meta: { ...old.meta, stale: true } };
        writeSeriesData(upd, dir);
      }
      setSeriesManifest(def.id, old, true, error);
      const obs = old?.observations ?? [];
      return { id: def.id, ok: false, stale: true, newPeriods: 0, revisions: 0, count: obs.length, firstPeriod: obs[0]?.period ?? null, lastPeriod: obs[obs.length - 1]?.period ?? null, error };
    };

    const total = targets.length;
    let authFailed = false;
    for (const [i, dsId] of targets.entries()) {
      const ds = dsConfigs[dsId];
      const t0 = Date.now();
      const defs = apiSeries.filter((s) => (s.source as { dataset: DatasetId }).dataset === dsId);
      const prev = manifest.datasets[dsId];
      const nowD = now();

      // ---- modo
      let mode: 'full' | 'windowed' = 'full';
      let modeReason = 'dataset de descarga completa';
      let windowStart: Period | undefined;
      if (ds.refreshMode === 'windowed') {
        windowStart = shiftPeriod(currentMonthBA(nowD), -ds.revisionWindowMonths);
        const lastFull = prev?.lastFullReconcileAt ? Date.parse(prev.lastFullReconcileAt) : NaN;
        const days = (nowD.getTime() - lastFull) / 86400_000;
        const stored = defs.map((d) => readSeriesData(d.id, dir));
        if (opts.full) modeReason = 'reconciliación forzada (--full)';
        else if (!Number.isFinite(lastFull)) modeReason = 'sin reconciliación completa previa';
        else if (days >= ds.fullReconcileDays) modeReason = `pasaron ${days.toFixed(1)} días desde la última reconciliación completa (umbral ${ds.fullReconcileDays})`;
        else if (stored.some((s) => !s || !s.observations.length || comparePeriods(s.observations[s.observations.length - 1]!.period, windowStart!) < 0))
          modeReason = 'store incompleto o anterior a la ventana';
        else {
          mode = 'windowed';
          modeReason = `ventana de ${ds.revisionWindowMonths} meses desde ${windowStart}`;
        }
        if (mode === 'full') windowStart = undefined;
      }

      log(`\n[${i + 1}/${total}] ${ds.title} (${dsId}) — ${mode === 'full' ? 'completo' : 'por ventana'}: ${modeReason}`);
      const outcome: DatasetOutcome = { dataset: dsId, ok: false, mode, modeReason, windowStart, rows: 0, totalRows: null, pages: 0, pagesFromCache: 0, seriesOk: 0, seriesFailed: 0, durationMs: 0 };
      const status: DatasetRunStatus = {
        dataset: dsId,
        lastSuccessAt: prev?.lastSuccessAt ?? null,
        lastAttemptAt: nowD.toISOString(),
        lastRunId: runId,
        ok: false,
        lastFullReconcileAt: prev?.lastFullReconcileAt ?? null,
        mode,
      };

      // ---- descarga
      let indexed: IndexedRow[];
      let queryUrl: string;
      const retrievedAt = nowD.toISOString();
      try {
        let lastLogged = 0;
        const res = await fetchDatasetRows(opts.client, ds, {
          fromPeriod: windowStart,
          onPage: (got, tot) => {
            if (tot > 20000 && got - lastLogged >= 50000) {
              lastLogged = got;
              log(`  … ${fmt(got)} / ${fmt(tot)} filas`);
            }
          },
        });
        outcome.rows = res.rows.length;
        outcome.totalRows = res.total;
        outcome.pages = res.pages;
        outcome.pagesFromCache = res.pagesFromCache;
        queryUrl = res.url;
        log(`  ${fmt(res.rows.length)} filas en ${res.pages} página(s)${res.pagesFromCache ? ` (${res.pagesFromCache} desde caché)` : ''}`);
        indexed = indexRows(ds, res.rows);
      } catch (e) {
        const err = toIngestError(e);
        outcome.error = { kind: err.kind, message: err.message, ...(err.httpStatus ? { httpStatus: err.httpStatus } : {}) };
        status.error = outcome.error;
        manifest.datasets[dsId] = status;
        log(`  ERROR (${err.kind}): ${err.message}`);
        log(`  Se conservan las ${defs.length} series anteriores, marcadas como desactualizadas.`);
        errors.push(`${dsId}: ${err.message}`);
        for (const def of defs) {
          seriesOutcomes.push(markStale(def, `Falla del dataset ${dsId}: ${err.message}`));
          outcome.seriesFailed++;
        }
        outcome.durationMs = Date.now() - t0;
        datasetOutcomes.push(outcome);
        if (err.kind === 'auth') {
          log('  Error de autenticación: se interrumpe la corrida (el resto de los datasets fallaría igual).');
          for (const rest of targets.slice(i + 1)) {
            const rds = dsConfigs[rest];
            const rdefs = apiSeries.filter((s) => (s.source as { dataset: DatasetId }).dataset === rest);
            manifest.datasets[rest] = { ...(manifest.datasets[rest] ?? { dataset: rest, lastSuccessAt: null, lastRunId: null }), dataset: rest, lastAttemptAt: now().toISOString(), lastRunId: runId, ok: false, error: outcome.error } as DatasetRunStatus;
            for (const def of rdefs) seriesOutcomes.push(markStale(def, `No actualizado: ${err.message}`));
            datasetOutcomes.push({ ...outcome, dataset: rest, mode: rds.refreshMode === 'full' ? 'full' : 'windowed', modeReason: 'no ejecutado', rows: 0, totalRows: null, pages: 0, pagesFromCache: 0, seriesOk: 0, seriesFailed: rdefs.length, durationMs: 0 });
          }
          authFailed = true;
          break;
        }
        continue;
      }

      // ---- normalización por serie
      const dsRevisions: RevisionRecord[] = [];
      for (const def of defs) {
        const old = readSeriesData(def.id, dir);
        const built = buildApiSeries(def, ds, indexed);
        let issues = [...built.issues];
        let obs = built.observations;
        if (!issues.length && mode === 'windowed') obs = mergeWindow(old?.observations, obs, windowStart!);
        if (!issues.length) issues = validateObservations(def, obs);
        if (!issues.length && mode === 'full' && old) {
          const before = nonNullCount(old.observations), after = nonNullCount(obs);
          if (before >= 12 && after < before * minRetain) issues.push(`caída abrupta de valores (${before} → ${after}); se rechaza para no perder historia`);
        }
        if (issues.length) {
          const msg = issues.join('; ');
          log(`  ✗ ${def.id}: ${msg}`);
          errors.push(`${def.id}: ${msg}`);
          seriesOutcomes.push({ ...markStale(def, msg), warnings: built.warnings });
          outcome.seriesFailed++;
          continue;
        }
        const revs = detectRevisions(def.id, old?.observations, obs, { runId, detectedAt: retrievedAt, scopeFrom: mode === 'windowed' ? windowStart : undefined });
        const newPeriods = old ? countNewPeriods(old.observations, obs) : 0;
        const data: SeriesData = {
          id: def.id,
          observations: obs,
          meta: {
            firstPeriod: obs[0]!.period,
            lastPeriod: obs[obs.length - 1]!.period,
            retrievedAt,
            runId,
            dataset: dsId,
            query: queryUrl!,
            publishedAt: null,
            // Filas con valor nulo ("s") excluidas de la suma en la descarga de esta corrida
            // (en modo ventana, solo las de la ventana).
            ...((def.source as { aggregate?: string }).aggregate === 'sum' ? { suppressedRows: built.suppressedRows } : {}),
            stale: false,
          },
        };
        writeSeriesData(data, dir);
        setSeriesManifest(def.id, data, false);
        dsRevisions.push(...revs);
        for (const w of built.warnings) log(`  aviso ${def.id}: ${w}`);
        seriesOutcomes.push({ id: def.id, ok: true, stale: false, newPeriods, firstLoad: !old, revisions: revs.length, count: obs.length, firstPeriod: data.meta.firstPeriod, lastPeriod: data.meta.lastPeriod, warnings: built.warnings.length ? built.warnings : undefined });
        outcome.seriesOk++;
      }
      appendRevisions(dsRevisions, dir);
      allRevisions.push(...dsRevisions);

      outcome.ok = outcome.seriesFailed === 0;
      status.ok = true; // la consulta del dataset fue exitosa (fallas de series se informan por serie)
      status.lastSuccessAt = retrievedAt;
      status.rowsFetched = outcome.rows;
      status.totalRows = outcome.totalRows;
      if (mode === 'full') status.lastFullReconcileAt = retrievedAt;
      if (outcome.seriesFailed) status.error = { kind: 'data', message: `${outcome.seriesFailed} serie(s) con problemas de datos` };
      manifest.datasets[dsId] = status;
      outcome.durationMs = Date.now() - t0;
      const lastP = seriesOutcomes.filter((s) => defs.some((d) => d.id === s.id) && s.ok).map((s) => s.lastPeriod).filter(Boolean) as Period[];
      const maxP = lastP.sort(comparePeriods).at(-1);
      log(
        `  ${outcome.seriesOk}/${defs.length} series OK${maxP ? ` · último período ${maxP}` : ''}` +
          `${dsRevisions.length ? ` · ${dsRevisions.length} revisión(es)` : ''} · ${(outcome.durationMs / 1000).toFixed(1)} s`,
      );
      datasetOutcomes.push(outcome);
    }

    // ---- nomenclaturas de comercio exterior
    if (doNomen && !authFailed && dsConfigs[NOMENCLATURAS_ID]) {
      const ds = dsConfigs[NOMENCLATURAS_ID];
      const t0 = Date.now();
      const nowIso = now().toISOString();
      log(`\n[nomenclaturas] ${ds.title} (${ds.id})`);
      const prev = manifest.datasets[NOMENCLATURAS_ID];
      const outcome: DatasetOutcome = { dataset: NOMENCLATURAS_ID, ok: false, mode: 'full', modeReason: 'tabla de códigos', rows: 0, totalRows: null, pages: 0, pagesFromCache: 0, seriesOk: 0, seriesFailed: 0, durationMs: 0 };
      try {
        const res = await fetchDatasetRows(opts.client, ds);
        const nomen: Record<string, Record<string, string>> = {};
        for (const r of res.rows) {
          const col = String(r.nombre_columna ?? ''), cod = String(r.codigo ?? '');
          if (!col || !cod) throw new IngestError('data', `Fila de nomenclatura incompleta: ${JSON.stringify(r).slice(0, 120)}`);
          (nomen[col] ??= {})[cod] = String(r.codigo_descripcion ?? '');
        }
        if (!Object.keys(nomen).length) throw new IngestError('data', 'Nomenclaturas vacías');
        writeNomenclaturas(nomen, dir);
        Object.assign(outcome, { ok: true, rows: res.rows.length, totalRows: res.total, pages: res.pages, pagesFromCache: res.pagesFromCache });
        manifest.datasets[NOMENCLATURAS_ID] = { dataset: NOMENCLATURAS_ID, lastSuccessAt: nowIso, lastAttemptAt: nowIso, lastRunId: runId, ok: true, rowsFetched: res.rows.length, totalRows: res.total, lastFullReconcileAt: nowIso, mode: 'full' };
        log(`  ${fmt(res.rows.length)} códigos en ${Object.keys(nomen).length} columnas (${Object.keys(nomen).join(', ')})`);
      } catch (e) {
        const err = toIngestError(e);
        outcome.error = { kind: err.kind, message: err.message, ...(err.httpStatus ? { httpStatus: err.httpStatus } : {}) };
        manifest.datasets[NOMENCLATURAS_ID] = { ...(prev ?? { dataset: NOMENCLATURAS_ID, lastSuccessAt: null, lastFullReconcileAt: null }), dataset: NOMENCLATURAS_ID, lastAttemptAt: nowIso, lastRunId: runId, ok: false, error: outcome.error, mode: 'full' } as DatasetRunStatus;
        errors.push(`${NOMENCLATURAS_ID}: ${err.message}`);
        log(`  ERROR (${err.kind}): ${err.message} — se conservan las nomenclaturas anteriores.`);
      }
      outcome.durationMs = Date.now() - t0;
      datasetOutcomes.push(outcome);
    }

    // ---- fuentes externas (datos.gob.ar, IDECBA): solo dashboard
    const extSeries = allSeries.filter((s) => s.source.kind === 'external');
    const extFeedIds = [...new Set(extSeries.map((s) => (s.source as ExternalSourceSpec).feed))];
    const feedTargets = opts.feeds ? extFeedIds.filter((f) => opts.feeds!.includes(f)) : opts.datasets?.length ? [] : extFeedIds;
    manifest.feeds ??= {};
    for (const feedId of feedTargets) {
      const feed = feedConfig(feedId);
      const defs = extSeries.filter((s) => (s.source as ExternalSourceSpec).feed === feedId);
      const nowIso = now().toISOString();
      const status: FeedRunStatus = { ...(manifest.feeds[feedId] ?? { feed: feedId, lastSuccessAt: null, lastRunId: null }), feed: feedId, lastAttemptAt: nowIso, lastRunId: runId, ok: false };
      log(`
[fuente externa] ${feed.title} (${feedId})`);
      const loader = opts.feedLoaders?.[feed.kind] ?? DEFAULT_LOADERS[feed.kind];
      let loaded;
      try {
        loaded = await loader(feed, { fetch: opts.fetch ?? fetch, now });
      } catch (e) {
        const err = toIngestError(e);
        status.error = { kind: err.kind, message: err.message };
        manifest.feeds[feedId] = status;
        errors.push(`${feedId}: ${err.message}`);
        log(`  ERROR (${err.kind}): ${err.message} — se conservan las ${defs.length} series anteriores.`);
        for (const def of defs) seriesOutcomes.push(markStale(def, `Falla de la fuente ${feedId}: ${err.message}`));
        continue;
      }
      const feedRevisions: RevisionRecord[] = [];
      let okCount = 0;
      for (const def of defs) {
        const src = def.source as ExternalSourceSpec;
        const raw = loaded.series[src.key];
        const issues: string[] = [];
        let obs: Observation[] = [];
        if (!raw) issues.push(`la fuente no trae la clave/columna "${src.key}"`);
        else {
          obs = raw.map((o) => {
            let value = o.value === null ? null : o.value * (src.scaleFactor ?? 1);
            if (value === 0 && src.zeroAsNullBefore && comparePeriods(o.period, src.zeroAsNullBefore) < 0) value = null;
            return { ...o, value };
          });
          // Se recortan nulos al inicio y al final (columnas que empiezan después o quedan atrasadas); nunca en el medio.
          const first = obs.findIndex((o) => o.value !== null);
          const last = obs.length - 1 - [...obs].reverse().findIndex((o) => o.value !== null);
          obs = first < 0 ? [] : obs.slice(first, last + 1);
          issues.push(...validateObservations(def, obs));
        }
        const old = readSeriesData(def.id, dir);
        if (!issues.length && old) {
          const before = nonNullCount(old.observations), after = nonNullCount(obs);
          if (before >= 12 && after < before * minRetain) issues.push(`caída abrupta de valores (${before} → ${after}); se rechaza para no perder historia`);
        }
        if (issues.length) {
          const msg = issues.join('; ');
          log(`  ✗ ${def.id}: ${msg}`);
          errors.push(`${def.id}: ${msg}`);
          seriesOutcomes.push(markStale(def, msg));
          continue;
        }
        const revs = detectRevisions(def.id, old?.observations, obs, { runId, detectedAt: loaded.retrievedAt });
        const data: SeriesData = {
          id: def.id,
          observations: obs,
          meta: { firstPeriod: obs[0]!.period, lastPeriod: obs[obs.length - 1]!.period, retrievedAt: loaded.retrievedAt, runId, query: loaded.url, publishedAt: null, stale: false },
        };
        writeSeriesData(data, dir);
        setSeriesManifest(def.id, data, false);
        feedRevisions.push(...revs);
        okCount++;
        seriesOutcomes.push({ id: def.id, ok: true, stale: false, newPeriods: old ? countNewPeriods(old.observations, obs) : 0, firstLoad: !old, revisions: revs.length, count: obs.length, firstPeriod: data.meta.firstPeriod, lastPeriod: data.meta.lastPeriod });
      }
      appendRevisions(feedRevisions, dir);
      allRevisions.push(...feedRevisions);
      status.ok = true;
      status.lastSuccessAt = loaded.retrievedAt;
      if (okCount < defs.length) status.error = { kind: 'data', message: `${defs.length - okCount} serie(s) con problemas de datos` };
      else delete status.error;
      manifest.feeds[feedId] = status;
      const lastP = defs.map((d) => manifest.series[d.id]?.lastPeriod).filter(Boolean).sort().at(-1);
      log(`  ${okCount}/${defs.length} series OK${lastP ? ` · último período ${lastP}` : ''}${feedRevisions.length ? ` · ${feedRevisions.length} revisión(es)` : ''}`);
    }

    // ---- series derivadas
    const derived = allSeries.filter((s) => s.source.kind === 'derived');
    if (derived.length) log(`\n[derivadas] ${derived.length} series calculadas con src/core/transforms.ts`);
    const done = new Set<string>();
    for (let pass = 0; pass < 5 && done.size < derived.length; pass++) {
      for (const def of derived) {
        if (done.has(def.id)) continue;
        const deps = dependenciesOf(def);
        if (deps.some((d) => derived.some((x) => x.id === d) && !done.has(d))) continue; // depende de otra derivada pendiente
        done.add(def.id);
        const depData = new Map(deps.map((d) => [d, readSeriesData(d, dir)]));
        const missing = deps.filter((d) => !depData.get(d)?.observations.length);
        if (missing.length) {
          // Entradas nunca cargadas (p.ej. corrida con --dataset): no es un error de esta corrida.
          // Si faltan por una falla de su dataset, esa falla ya se informó.
          log(`  – ${def.id}: omitida (faltan entradas en el store: ${missing.join(', ')})`);
          if (readSeriesData(def.id, dir)) seriesOutcomes.push(markStale(def, `Entradas faltantes: ${missing.join(', ')}`));
          continue;
        }
        const built = buildDerivedSeries(def, (id) => depData.get(id)?.observations ?? null);
        const issues = built.issues.length ? built.issues : validateObservations(def, built.observations);
        if (issues.length) {
          const msg = issues.join('; ');
          log(`  ✗ ${def.id}: ${msg}`);
          errors.push(`${def.id}: ${msg}`);
          seriesOutcomes.push(markStale(def, msg));
          continue;
        }
        const old = readSeriesData(def.id, dir);
        const stale = [...depData.values()].some((d) => !d || d.meta.stale);
        const retrievedAt = [...depData.values()].map((d) => d?.meta.retrievedAt ?? '').sort().at(-1) || now().toISOString();
        const obs = built.observations;
        const revs = detectRevisions(def.id, old?.observations, obs, { runId, detectedAt: now().toISOString() });
        const data: SeriesData = {
          id: def.id,
          observations: obs,
          meta: { firstPeriod: obs[0]!.period, lastPeriod: obs[obs.length - 1]!.period, retrievedAt, runId, publishedAt: null, stale },
        };
        writeSeriesData(data, dir);
        appendRevisions(revs, dir);
        allRevisions.push(...revs);
        setSeriesManifest(def.id, data, stale, stale ? 'Calculada con alguna serie de entrada desactualizada' : undefined);
        seriesOutcomes.push({ id: def.id, ok: true, stale, newPeriods: old ? countNewPeriods(old.observations, obs) : 0, firstLoad: !old, revisions: revs.length, count: obs.length, firstPeriod: data.meta.firstPeriod, lastPeriod: data.meta.lastPeriod });
      }
    }
    for (const def of derived) if (!done.has(def.id)) errors.push(`${def.id}: dependencias circulares o no resueltas`);

    // ---- manifest y resumen
    const finishedAt = now().toISOString();
    const failedDatasets = datasetOutcomes.filter((d) => d.error).length;
    const ok = errors.length === 0;
    const partial = !ok && datasetOutcomes.some((d) => d.ok || d.seriesOk > 0);
    manifest.dataMode = 'real';
    manifest.generatedAt = finishedAt;
    manifest.lastRun = { runId, startedAt, finishedAt, ok, partial };
    writeManifest(manifest, dir);

    const summary: RefreshSummary = { runId, startedAt, finishedAt, ok, partial, datasets: datasetOutcomes, series: seriesOutcomes, revisions: allRevisions, errors };
    if (opts.runsDir !== null) {
      const runsDir = opts.runsDir ?? path.join(path.dirname(dir), 'runs');
      try {
        writeJsonAtomic(path.join(runsDir, `${runId}.json`), summary);
      } catch (e) {
        log(`Aviso: no se pudo escribir el resumen de la corrida (${(e as Error).message})`);
      }
    }
    logSummary(summary, log, failedDatasets);
    return summary;
  } finally {
    release();
  }
}

function logSummary(s: RefreshSummary, log: (m: string) => void, failedDatasets: number): void {
  const okSeries = s.series.filter((x) => x.ok);
  const changed = okSeries.filter((x) => x.newPeriods > 0 || x.revisions > 0);
  const newPeriods = okSeries.reduce((a, x) => a + x.newPeriods, 0);
  const byKind = (k: RevisionRecord['kind']) => s.revisions.filter((r) => r.kind === k).length;
  const stale = s.series.filter((x) => x.stale);
  log('\n== Resumen');
  log(`Datasets: ${s.datasets.filter((d) => !d.error).length}/${s.datasets.length} OK${failedDatasets ? ` · ${failedDatasets} con error` : ''}`);
  const first = okSeries.filter((x) => x.firstLoad).length;
  log(`Series actualizadas: ${okSeries.length}/${s.series.length} (con cambios: ${changed.length}${first ? `, cargadas por primera vez: ${first}` : ""}) · con error: ${s.series.filter((x) => !x.ok).length} · desactualizadas (stale): ${stale.length}`);
  log(`Nuevos períodos: ${newPeriods}${newPeriods ? ` (${changed.filter((x) => x.newPeriods).slice(0, 8).map((x) => `${x.id} +${x.newPeriods}`).join(', ')}${changed.filter((x) => x.newPeriods).length > 8 ? ', …' : ''})` : ''}`);
  log(`Revisiones: ${s.revisions.length} (revisadas ${byKind('revised')}, agregadas en la historia ${byKind('added_historical')}, eliminadas ${byKind('removed')})`);
  if (s.revisions.length) {
    const bySeries = new Map<string, number>();
    for (const r of s.revisions) bySeries.set(r.seriesId, (bySeries.get(r.seriesId) ?? 0) + 1);
    log(`  Por serie: ${[...bySeries].slice(0, 12).map(([id, n]) => `${id} (${n})`).join(', ')}${bySeries.size > 12 ? ', …' : ''}`);
  }
  if (s.errors.length) {
    log(`Errores (${s.errors.length}):`);
    for (const e of s.errors.slice(0, 30)) log(`  - ${e}`);
  }
  log(s.ok ? 'Resultado: OK' : s.partial ? 'Resultado: PARCIAL (hubo fallas; se conservaron los últimos datos válidos)' : 'Resultado: FALLÓ');
}
