/**
 * Tasa de caución a 1 día de A3 Mercados (índice I.CAUCION).
 * Fuente independiente del BCRA: no se valida contra el catálogo BCRA v4 ni se le asigna un ID BCRA.
 *
 * Endpoint público (sin credenciales) que alimenta el gráfico del sitio de A3:
 *   GET https://ws.matbarofex.com.ar:8999/api/caucion?from=YYYY-MM-DD&to=YYYY-MM-DD&closed_value=1
 *   → [{ date, value, volume, p1, p25, p75, p99, name: 'I.CAUCION', ... }]
 * `value` es la tasa de referencia diaria (TNA, %); la historia comienza el 07/11/2024.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeJsonAtomic } from '../core/store';
import { acquireLock } from '../ingest/lock';
import { validDate } from './client';
export { CAUCION_DEF, CAUCION_FIRST_DATE, CAUCION_URL } from './caucionDef';
import { monetaryStoreDir, readMonetaryManifest, readMonetarySeries, writeMonetarySeries } from './store';
import { CAUCION_DEF, CAUCION_FIRST_DATE, CAUCION_INDEX_NAME, CAUCION_URL } from './caucionDef';
import type { MonetaryManifest, MonetaryObservation } from './types';
import type { MonetaryRevision } from './refresh';

/** Fecha 'YYYY-MM-DD' o 'YYYY-MM-DD HH:MM:SS' → 'YYYY-MM-DD'. Valor no numérico → error (nunca 0). */
export function normalizeCaucion(rows: unknown): MonetaryObservation[] {
  if (!Array.isArray(rows)) throw new Error('Respuesta de caución inesperada (no es un arreglo)');
  const seen = new Map<string, number | null>();
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') throw new Error('Observación de caución inválida');
    const { date, value, name } = raw as { date?: unknown; value?: unknown; name?: unknown };
    if (name !== undefined && name !== CAUCION_INDEX_NAME) throw new Error(`Índice de caución inesperado: ${String(name)}`);
    const day = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(date) ? date.slice(0, 10) : null;
    if (!validDate(day)) throw new Error(`Fecha de caución inválida: ${String(date)}`);
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`Valor de caución inválido en ${day}`);
    if (seen.has(day)) throw new Error(`Fecha duplicada de caución: ${day}`);
    seen.set(day, value as number | null);
  }
  return [...seen].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

export interface CaucionClientOptions { fetch?: typeof fetch; retries?: number; timeoutMs?: number }

export async function fetchCaucion(from: string, to: string, options: CaucionClientOptions = {}): Promise<MonetaryObservation[]> {
  if (!validDate(from) || !validDate(to) || from > to) throw new Error('Rango de fechas de caución inválido');
  const url = `${CAUCION_URL}?from=${from}&to=${to}&closed_value=1`;
  let lastError: unknown;
  for (let attempt = 0; attempt <= (options.retries ?? 3); attempt++) {
    try {
      const response = await (options.fetch ?? fetch)(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(options.timeoutMs ?? 45_000) });
      const body = await response.text();
      if (!response.ok) throw new Error(/NOINDEX|iframe|Incapsula|Request unsuccessful/i.test(body) ? `A3 HTTP ${response.status}: bloqueado por WAF` : `A3 HTTP ${response.status}`);
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch { throw new Error('Respuesta de caución no es JSON'); }
      const observations = normalizeCaucion(parsed);
      if (observations.some(o => o.date < from || o.date > to)) throw new Error('A3 devolvió fechas fuera del rango solicitado');
      return observations;
    } catch (error) {
      lastError = error;
      if (attempt < (options.retries ?? 3)) await new Promise(resolve => setTimeout(resolve, Math.min(500 * 2 ** attempt, 4000)));
    }
  }
  throw lastError;
}

export interface CaucionRefreshOptions { dir?: string; now?: () => Date; log?: (message: string) => void; fetch?: (from: string, to: string) => Promise<MonetaryObservation[]> }

/**
 * Descarga completa en cada corrida (≈2 años de datos hábiles, una sola consulta) y
 * registra revisiones contra la versión anterior. Ante falla conserva el último conjunto válido.
 */
export async function refreshCaucion(options: CaucionRefreshOptions = {}) {
  const dir = options.dir ?? monetaryStoreDir();
  const now = (options.now ?? (() => new Date()))();
  const timestamp = now.toISOString();
  const today = timestamp.slice(0, 10);
  const runId = `${timestamp}-${crypto.randomBytes(4).toString('hex')}`;
  const log = options.log ?? console.log;
  const release = acquireLock(path.join(dir, '.lock'), { runId });
  const def = CAUCION_DEF;
  try {
    const manifest: MonetaryManifest = readMonetaryManifest(dir) ?? { schemaVersion: 1, updatedAt: null, lastAttemptAt: timestamp, lastFullAt: null, series: {} };
    manifest.lastAttemptAt = timestamp;
    const previous = readMonetarySeries(def.id, dir);
    let ok = false;
    let revisions: MonetaryRevision[] = [];
    try {
      const incoming = await (options.fetch ?? ((from, to) => fetchCaucion(from, to)))(CAUCION_FIRST_DATE, today);
      if (!incoming.some(o => o.value !== null)) throw new Error('Serie de caución vacía o sin valores válidos');
      const previousValid = previous?.observations.filter(o => o.value !== null).length ?? 0;
      if (previousValid && incoming.filter(o => o.value !== null).length < previousValid * 0.8) throw new Error('Pérdida de más del 20% de observaciones; se conserva la versión anterior');
      const oldMap = new Map(previous?.observations.map(o => [o.date, o.value]) ?? []);
      const newMap = new Map(incoming.map(o => [o.date, o.value]));
      const lastPrevious = previous?.observations.at(-1)?.date ?? '';
      for (const date of new Set([...oldMap.keys(), ...newMap.keys()])) {
        if (!oldMap.has(date) && date > lastPrevious) continue;
        if (oldMap.has(date) && newMap.has(date) && oldMap.get(date) === newMap.get(date)) continue;
        revisions.push({ id: def.id, date, oldValue: oldMap.get(date) ?? null, newValue: newMap.get(date) ?? null, kind: !newMap.has(date) ? 'removed' : !oldMap.has(date) ? 'added_historical' : 'revised', detectedAt: timestamp, runId });
      }
      writeMonetarySeries({ def: { ...def, firstDate: incoming[0]!.date, lastDate: incoming.at(-1)!.date }, observations: incoming, retrievedAt: timestamp, stale: false }, dir);
      manifest.series[def.id] = { count: incoming.length, firstDate: incoming[0]!.date, lastDate: incoming.at(-1)!.date, retrievedAt: timestamp, stale: false };
      manifest.updatedAt = timestamp;
      ok = true;
      log(`A3 · ${def.shortName}: ${incoming.length} observaciones${revisions.length ? `; ${revisions.length} revisiones` : ''}`);
    } catch (error) {
      revisions = [];
      const message = error instanceof Error ? error.message : String(error);
      if (previous) writeMonetarySeries({ ...previous, stale: true, error: message }, dir);
      manifest.series[def.id] = { count: previous?.observations.length ?? 0, firstDate: previous?.observations[0]?.date ?? null, lastDate: previous?.observations.at(-1)?.date ?? null, retrievedAt: previous?.retrievedAt ?? '', stale: true, error: message };
      log(`A3 · ${def.shortName}: ${message}; último conjunto válido conservado`);
    }
    writeJsonAtomic(path.join(dir, 'manifest.json'), manifest);
    if (revisions.length) fs.appendFileSync(path.join(dir, 'revisions.jsonl'), revisions.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    return { ok, runId, revisions: revisions.length };
  } finally { release(); }
}
