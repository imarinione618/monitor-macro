/**
 * Actualización de precios de combustibles.
 *
 * Surtidor (Res. 314, diaria):
 *  - Reconciliación (carga inicial, `--full`, sin estado o cada RECONCILE_EVERY_DAYS): histórico
 *    completo en streaming (~780 MB) + foto de vigentes; se recalcula toda la serie desde 2018.
 *  - Corrida diaria: estado persistido (eventos recientes por estación/producto) + vigentes (~9 MB);
 *    se recalculan los últimos SURTIDOR_RECOMPUTE_DAYS días para absorber cargas tardías.
 *  - Si el histórico falla y hay estado, se cae a la corrida diaria y se reintenta la próxima vez.
 * EESS (Res. 1104, mensual): archivo vigente como mucho cada RECONCILE_EVERY_DAYS (o `--full`);
 *  los anuales solo en la carga inicial o con `--full`.
 * Cualquier diferencia contra lo publicado antes queda en revisions.jsonl. Ante falla se conserva
 * el último conjunto válido marcado `stale`.
 */
import path from 'node:path';
import crypto from 'node:crypto';
import { acquireLock } from '../ingest/lock';
import { httpLines, type LineReader } from './csv';
import {
  EESS_DEFS, EESS_FIRST_YEAR, EESS_PACKAGE_URL, EESS_VIGENTE_RESOURCE_ID, EESS_VIGENTE_URL, RECONCILE_EVERY_DAYS,
  SURTIDOR_DEFS, SURTIDOR_FIRST_DAY, SURTIDOR_HISTORICO_URL, SURTIDOR_RECOMPUTE_DAYS, SURTIDOR_VIGENTES_URL,
} from './defs';
import { EessAccumulator, finalizeEess, pickEessResources, readEessCsv, type CkanResource } from './eess';
import {
  EventBook, addDays, argentinaDay, closedLastDay, computeDaily, decodeState, encodeState, minuteString, readSurtidorCsv, type ReadStats,
} from './surtidor';
import {
  appendFuelRevisions, combustiblesStoreDir, emptyFuelManifest, readFuelManifest, readFuelSeries, readSurtidorState, writeFuelManifest,
  writeFuelSeries, writeSurtidorState,
} from './store';
import type { FuelDef, FuelManifest, FuelObservation, FuelRevision, FuelSeries } from './types';

export interface CombustiblesRefreshOptions {
  /** Fuerza reconstrucción completa: histórico 314 + anuales y vigente 1104. */
  full?: boolean;
  /** Limita la corrida a una de las dos fuentes. */
  only?: 'surtidor' | 'eess';
  dir?: string;
  now?: () => Date;
  log?: (message: string) => void;
  /** fetch inyectable (package_show y, si no se pasa `readLines`, las descargas CSV). */
  fetch?: typeof fetch;
  /** Lector de líneas por URL (tests / archivos locales). Por defecto, descarga HTTP en streaming. */
  readLines?: LineReader;
  /** Reintentos por descarga (por defecto 2) y espera base entre intentos. */
  retries?: number;
  retryDelayMs?: number;
}

export interface CombustiblesRefreshResult {
  ok: boolean;
  runId: string;
  surtidor: { ok: boolean; skipped?: boolean; mode?: 'historico' | 'vigentes'; lastDay?: string | null; error?: string };
  eess: { ok: boolean; skipped?: boolean; annual?: boolean; lastPeriod?: string | null; error?: string };
  revisions: number;
}

const DAY_MS = 86_400_000;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const sameValue = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a)));
const due = (last: string | null | undefined, now: Date) => !last || now.getTime() - Date.parse(last) >= RECONCILE_EVERY_DAYS * DAY_MS - 3600_000;

/** Revisiones de `previous` frente a `next` para fechas ≥ `from` (nuevas fechas posteriores al último dato no son revisiones). */
export function diffObservations(id: string, previous: FuelObservation[], next: FuelObservation[], from: string, detectedAt: string, runId: string): FuelRevision[] {
  const oldMap = new Map(previous.filter(o => o.date >= from).map(o => [o.date, o]));
  const newMap = new Map(next.filter(o => o.date >= from).map(o => [o.date, o]));
  const lastPrevious = previous.at(-1)?.date ?? '';
  const out: FuelRevision[] = [];
  for (const date of [...new Set([...oldMap.keys(), ...newMap.keys()])].sort()) {
    const o = oldMap.get(date), n = newMap.get(date);
    if (!o && date > lastPrevious) continue;
    if (o && n && sameValue(o.value, n.value)) continue;
    out.push({
      id, date, oldValue: o?.value ?? null, newValue: n?.value ?? null,
      ...(o?.n !== undefined ? { oldN: o.n } : {}), ...(n?.n !== undefined ? { newN: n.n } : {}),
      kind: !n ? 'removed' : !o ? 'added_historical' : 'revised', detectedAt, runId,
    });
  }
  return out;
}

const nonNull = (obs: FuelObservation[]) => obs.reduce((acc, o) => acc + (o.value !== null ? 1 : 0), 0);

interface Context {
  dir: string; now: Date; timestamp: string; today: string; runId: string; full: boolean;
  log: (m: string) => void; readLines: LineReader; fetch: typeof fetch; retries: number; retryDelayMs: number;
  manifest: FuelManifest; revisions: FuelRevision[];
}

async function withRetries<T>(ctx: Context, label: string, fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt <= ctx.retries; attempt++) {
    try { return await fn(); }
    catch (error) {
      last = error;
      if (/cambió el esquema|ahora se llama/.test(errorMessage(error))) break;
      if (attempt < ctx.retries) {
        ctx.log(`${label}: ${errorMessage(error)}; reintento ${attempt + 1}/${ctx.retries}`);
        await new Promise(resolve => setTimeout(resolve, ctx.retryDelayMs * (attempt + 1)));
      }
    }
  }
  throw last;
}

const describe = (s: ReadStats) => `${s.rows.toLocaleString('es-AR')} filas, ${s.used.toLocaleString('es-AR')} eventos usados` +
  (s.badDate + s.outOfRange ? `, ${s.badDate + s.outOfRange} fechas inválidas o fuera de rango descartadas` : '') +
  (s.badPrice ? `, ${s.badPrice} precios ilegibles` : '') + (s.conflicts ? `, ${s.conflicts} declaraciones contradictorias` : '');

/**
 * Valida (pérdida de datos), registra revisiones y escribe todas las series de un bloque.
 * Si una sola serie falla la validación no se escribe ninguna (el bloque es atómico).
 */
function commitBlock(ctx: Context, defs: FuelDef[], next: Map<string, FuelObservation[]>, previous: Map<string, FuelSeries | null>, diffFrom: Map<string, string>): number {
  for (const def of defs) {
    const obs = next.get(def.id) ?? [];
    const prev = previous.get(def.id);
    if (!nonNull(obs)) throw new Error(`${def.shortName}: serie sin valores válidos`);
    if (prev && nonNull(obs) < nonNull(prev.observations) * 0.8) throw new Error(`${def.shortName}: pérdida de más del 20% de observaciones; se conserva la versión anterior`);
  }
  let count = 0;
  for (const def of defs) {
    const obs = next.get(def.id)!;
    const prev = previous.get(def.id);
    const revisions = prev ? diffObservations(def.id, prev.observations, obs, diffFrom.get(def.id) ?? '', ctx.timestamp, ctx.runId) : [];
    ctx.revisions.push(...revisions);
    count += revisions.length;
    writeFuelSeries({ def, observations: obs, retrievedAt: ctx.timestamp, stale: false }, ctx.dir);
    const lastValid = [...obs].reverse().find(o => o.value !== null);
    ctx.manifest.series[def.id] = { count: obs.length, firstDate: obs[0]?.date ?? null, lastDate: obs.at(-1)?.date ?? null, lastValue: lastValid?.value ?? null, retrievedAt: ctx.timestamp, stale: false };
  }
  return count;
}

function markStale(ctx: Context, defs: FuelDef[], message: string): void {
  for (const def of defs) {
    const prev = readFuelSeries(def.id, ctx.dir);
    if (prev) writeFuelSeries({ ...prev, def, stale: true, error: message }, ctx.dir);
    const lastValid = prev ? [...prev.observations].reverse().find(o => o.value !== null) : undefined;
    ctx.manifest.series[def.id] = {
      count: prev?.observations.length ?? 0, firstDate: prev?.observations[0]?.date ?? null, lastDate: prev?.observations.at(-1)?.date ?? null,
      lastValue: lastValid?.value ?? null, retrievedAt: prev?.retrievedAt ?? '', stale: true, error: message,
    };
  }
}

// ── Surtidor (Res. 314) ───────────────────────────────────────────────────────────────────────

async function refreshSurtidor(ctx: Context): Promise<CombustiblesRefreshResult['surtidor']> {
  const previous = new Map(SURTIDOR_DEFS.map(def => [def.id, readFuelSeries(def.id, ctx.dir)] as const));
  let state = null;
  try { state = readSurtidorState(ctx.dir); } catch (error) { ctx.log(`Surtidor: estado ilegible (${errorMessage(error)}); se reconstruye desde el histórico`); }
  const m = ctx.manifest.surtidor;
  const needHistorico = ctx.full || !state || !m.lastDay || [...previous.values()].some(s => !s) || due(m.lastHistoricoAt, ctx.now);

  let book: EventBook | null = null;
  let mode: 'historico' | 'vigentes' = 'vigentes';
  let historicoError: string | undefined;
  if (needHistorico) {
    try {
      book = await withRetries(ctx, 'Histórico Res. 314', async () => {
        const b = new EventBook();
        const stats = await readSurtidorCsv(ctx.readLines(SURTIDOR_HISTORICO_URL), b, ctx.today, 'Histórico Res. 314');
        ctx.log(`Histórico Res. 314: ${describe(stats)}`);
        if (!stats.used) throw new Error('Histórico Res. 314 sin eventos válidos');
        return b;
      });
      mode = 'historico';
    } catch (error) {
      historicoError = errorMessage(error);
      if (ctx.full || !state || !m.lastDay || [...previous.values()].some(s => !s)) throw error;
      ctx.log(`Histórico Res. 314: ${historicoError}; se usa la corrida diaria (vigentes + estado) y se reintenta la próxima vez`);
    }
  }

  let vigentesOk = false;
  if (mode === 'historico') {
    try {
      const stats = await withRetries(ctx, 'Vigentes Res. 314', () => readSurtidorCsv(ctx.readLines(SURTIDOR_VIGENTES_URL), book!, ctx.today, 'Vigentes Res. 314'));
      ctx.log(`Vigentes Res. 314: ${describe(stats)}`);
      vigentesOk = true;
    } catch (error) { ctx.log(`Vigentes Res. 314: ${errorMessage(error)}; se calcula solo con el histórico`); }
  } else {
    book = await withRetries(ctx, 'Vigentes Res. 314', async () => {
      const b = decodeState(state!);
      const stats = await readSurtidorCsv(ctx.readLines(SURTIDOR_VIGENTES_URL), b, ctx.today, 'Vigentes Res. 314');
      ctx.log(`Vigentes Res. 314: ${describe(stats)}`);
      return b;
    });
    vigentesOk = true;
  }

  const maxMinute = book!.maxMinute();
  const lastDay = closedLastDay(maxMinute, ctx.today);
  let from = SURTIDOR_FIRST_DAY;
  if (mode === 'vigentes') {
    const candidate = addDays(m.lastDay!, -SURTIDOR_RECOMPUTE_DAYS);
    from = [SURTIDOR_FIRST_DAY, candidate, state!.retainedFrom].sort().at(-1)!;
  }
  if (!lastDay || lastDay < from) throw new Error('Sin eventos de precios suficientemente recientes para calcular la serie diaria');
  const computed = computeDaily(book!, from, lastDay);
  const next = new Map<string, FuelObservation[]>();
  const diffFrom = new Map<string, string>();
  for (const def of SURTIDOR_DEFS) {
    const incoming = computed.get(def.id)!;
    const prev = previous.get(def.id);
    next.set(def.id, mode === 'historico' || !prev ? incoming : [...prev.observations.filter(o => o.date < from), ...incoming]);
    diffFrom.set(def.id, mode === 'historico' ? '' : from);
  }
  const revisions = commitBlock(ctx, SURTIDOR_DEFS, next, previous, diffFrom);
  writeSurtidorState(encodeState(book!, lastDay, ctx.timestamp), ctx.dir);
  if (mode === 'historico') m.lastHistoricoAt = ctx.timestamp;
  if (vigentesOk) m.lastVigentesAt = ctx.timestamp;
  m.lastEventAt = maxMinute === null ? null : minuteString(maxMinute);
  m.lastDay = lastDay;
  m.mode = mode;
  if (historicoError) m.error = `Histórico no disponible: ${historicoError}`; else delete m.error;
  ctx.log(`Surtidor (${mode === 'historico' ? 'reconciliación con histórico' : 'corrida diaria'}): ${from} → ${lastDay}; último evento ${m.lastEventAt}; ${revisions} revisiones`);
  return { ok: true, mode, lastDay };
}

// ── EESS (Res. 1104) ──────────────────────────────────────────────────────────────────────────

async function eessResources(ctx: Context): Promise<CkanResource[]> {
  return withRetries(ctx, 'Catálogo Res. 1104', async () => {
    const response = await ctx.fetch(EESS_PACKAGE_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Catálogo Res. 1104: HTTP ${response.status}`);
    const body = await response.json() as { success?: boolean; result?: { resources?: CkanResource[] } };
    if (!body.success || !Array.isArray(body.result?.resources)) throw new Error('Catálogo Res. 1104: respuesta inesperada');
    return body.result!.resources!;
  });
}

async function refreshEess(ctx: Context): Promise<CombustiblesRefreshResult['eess']> {
  const previous = new Map(EESS_DEFS.map(def => [def.id, readFuelSeries(def.id, ctx.dir)] as const));
  const m = ctx.manifest.eess;
  const missing = [...previous.values()].some(s => !s);
  if (!ctx.full && !missing && !due(m.lastVigenteAt, ctx.now)) {
    ctx.log(`EESS Res. 1104: archivo vigente descargado el ${m.lastVigenteAt?.slice(0, 10)}; se vuelve a bajar cada ${RECONCILE_EVERY_DAYS} días`);
    return { ok: true, skipped: true, lastPeriod: m.lastPeriod };
  }
  const annualNeeded = ctx.full || missing || !m.lastAnnualAt;
  let resources: CkanResource[] | null = null;
  try { resources = await eessResources(ctx); }
  catch (error) { if (annualNeeded) throw error; ctx.log(`${errorMessage(error)}; se usa la URL conocida del archivo vigente`); }
  const picked = resources ? pickEessResources(resources, EESS_FIRST_YEAR, EESS_VIGENTE_RESOURCE_ID) : { annual: [], vigente: null };
  const vigenteUrl = picked.vigente ?? EESS_VIGENTE_URL;

  // El archivo vigente prevalece sobre los anuales en los meses que se superponen (2024/12), y
  // cada anual sobre los anteriores: se lee del más nuevo al más viejo saltando meses ya cubiertos.
  const acc = new EessAccumulator();
  const covered = new Set<string>();
  const readInto = async (url: string, label: string) => {
    await withRetries(ctx, label, async () => {
      const fileAcc = new EessAccumulator();
      const stats = await readEessCsv(ctx.readLines(url), fileAcc, label);
      if (!stats.used) throw new Error(`${label}: sin registros válidos`);
      const periods = fileAcc.periods().filter(p => !covered.has(p));
      acc.merge(fileAcc, new Set(periods));
      periods.forEach(p => covered.add(p));
      ctx.log(`${label}: ${stats.rows.toLocaleString('es-AR')} filas, ${stats.used.toLocaleString('es-AR')} registros al público usados; meses ${periods[0] ?? '—'} → ${periods.at(-1) ?? '—'}`);
    });
  };
  await readInto(vigenteUrl, 'EESS Res. 1104 vigente');
  const vigentePeriods = [...covered].sort();
  if (annualNeeded) {
    if (!picked.annual.length) throw new Error('Catálogo Res. 1104 sin archivos anuales');
    for (const { year, url } of [...picked.annual].reverse()) await readInto(url, `EESS Res. 1104 ${year}`);
  }
  const computed = finalizeEess(acc);
  const next = new Map<string, FuelObservation[]>();
  const diffFrom = new Map<string, string>();
  const firstVigente = vigentePeriods[0]!;
  for (const def of EESS_DEFS) {
    const incoming = computed.get(def.id)!;
    const prev = previous.get(def.id);
    next.set(def.id, annualNeeded || !prev ? incoming : [...prev.observations.filter(o => o.date < firstVigente), ...incoming]);
    diffFrom.set(def.id, annualNeeded ? '' : firstVigente);
  }
  const revisions = commitBlock(ctx, EESS_DEFS, next, previous, diffFrom);
  m.lastVigenteAt = ctx.timestamp;
  if (annualNeeded) m.lastAnnualAt = ctx.timestamp;
  m.lastPeriod = vigentePeriods.at(-1) ?? null;
  delete m.error;
  ctx.log(`EESS Res. 1104: ${annualNeeded ? 'reconstrucción completa' : 'archivo vigente'} hasta ${m.lastPeriod}; ${revisions} revisiones`);
  return { ok: true, annual: annualNeeded, lastPeriod: m.lastPeriod };
}

// ── Orquestación ──────────────────────────────────────────────────────────────────────────────

export async function refreshCombustibles(options: CombustiblesRefreshOptions = {}): Promise<CombustiblesRefreshResult> {
  const dir = options.dir ?? combustiblesStoreDir();
  const now = (options.now ?? (() => new Date()))();
  const timestamp = now.toISOString();
  const runId = `${timestamp}-${crypto.randomBytes(4).toString('hex')}`;
  const log = options.log ?? console.log;
  const release = acquireLock(path.join(dir, '.lock'), { runId, log });
  try {
    const manifest = readFuelManifest(dir) ?? emptyFuelManifest(timestamp);
    manifest.lastAttemptAt = timestamp;
    const ctx: Context = {
      dir, now, timestamp, today: argentinaDay(now), runId, full: !!options.full, log,
      readLines: options.readLines ?? httpLines({ fetch: options.fetch }), fetch: options.fetch ?? fetch,
      retries: options.retries ?? 2, retryDelayMs: options.retryDelayMs ?? 5000, manifest, revisions: [],
    };
    let surtidor: CombustiblesRefreshResult['surtidor'] = { ok: true, skipped: true };
    let eess: CombustiblesRefreshResult['eess'] = { ok: true, skipped: true };
    if (options.only !== 'eess') {
      try { surtidor = await refreshSurtidor(ctx); }
      catch (error) {
        const message = errorMessage(error);
        ctx.revisions = ctx.revisions.filter(r => !r.id.startsWith('combustibles.surtidor.'));
        markStale(ctx, SURTIDOR_DEFS, message);
        manifest.surtidor.error = message;
        surtidor = { ok: false, error: message };
        log(`Surtidor Res. 314: ${message}; último conjunto válido conservado`);
      }
    }
    if (options.only !== 'surtidor') {
      try { eess = await refreshEess(ctx); }
      catch (error) {
        const message = errorMessage(error);
        ctx.revisions = ctx.revisions.filter(r => !r.id.startsWith('combustibles.eess.'));
        markStale(ctx, EESS_DEFS, message);
        manifest.eess.error = message;
        eess = { ok: false, error: message };
        log(`EESS Res. 1104: ${message}; último conjunto válido conservado`);
      }
    }
    if ((surtidor.ok && !surtidor.skipped) || (eess.ok && !eess.skipped)) manifest.updatedAt = timestamp;
    writeFuelManifest(manifest, dir);
    appendFuelRevisions(ctx.revisions, dir);
    return { ok: surtidor.ok && eess.ok, runId, surtidor, eess, revisions: ctx.revisions.length };
  } finally { release(); }
}
