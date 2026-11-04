import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeJsonAtomic } from '../core/store';
import { acquireLock } from '../ingest/lock';
import { BcraClient } from './client';
import { MONETARY_CATALOG } from './catalog';
import { monetaryStoreDir, readMonetaryManifest, readMonetarySeries, writeMonetarySeries } from './store';
import type { MonetaryDef, MonetaryManifest, MonetaryObservation } from './types';

export interface MonetaryRefreshOptions {
  full?: boolean;
  dir?: string;
  client?: Pick<BcraClient, 'catalog' | 'observations'>;
  catalog?: MonetaryDef[];
  now?: () => Date;
  log?: (message: string) => void;
}
export interface MonetaryRevision { id: string; date: string; oldValue: number | null; newValue: number | null; kind: 'revised' | 'removed' | 'added_historical'; detectedAt: string; runId: string }

export function reconcileObservations(previous: MonetaryObservation[], incoming: MonetaryObservation[], from: string, to: string): MonetaryObservation[] {
  return [...previous.filter(p => p.date < from || p.date > to), ...incoming].sort((a, b) => a.date.localeCompare(b.date));
}

export async function refreshMonetary(options: MonetaryRefreshOptions = {}) {
  const dir = options.dir ?? monetaryStoreDir();
  const now = (options.now ?? (() => new Date()))();
  const timestamp = now.toISOString();
  const today = timestamp.slice(0, 10);
  const runId = `${timestamp}-${crypto.randomBytes(4).toString('hex')}`;
  const log = options.log ?? console.log;
  const release = acquireLock(path.join(dir, '.lock'), { runId });
  const targets = options.catalog ?? MONETARY_CATALOG;
  const client = options.client ?? new BcraClient();
  try {
    const manifest: MonetaryManifest = readMonetaryManifest(dir) ?? { schemaVersion: 1, updatedAt: null, lastAttemptAt: timestamp, lastFullAt: null, series: {} };
    const full = options.full || !manifest.lastFullAt || now.getTime() - Date.parse(manifest.lastFullAt) >= 30 * 86400_000;
    manifest.lastAttemptAt = timestamp;
    let liveCatalog;
    let catalogError: string | undefined;
    try { liveCatalog = await client.catalog(!!full); }
    catch (error) { catalogError = `No se verificó catálogo BCRA: ${error instanceof Error ? error.message : String(error)}`; }
    const outcomes: { id: string; ok: boolean; count: number; error?: string }[] = [];
    const revisions: MonetaryRevision[] = [];
    for (const def of targets) {
      const previous = readMonetarySeries(def.id, dir);
      try {
        if (catalogError) throw new Error(catalogError);
        const metadata = liveCatalog!.find(m => m.idVariable === def.bcraId);
        if (!metadata || metadata.unidadExpresion !== def.originalUnit || metadata.periodicidad !== def.frequency || metadata.descripcion.trim() !== def.name) throw new Error(`Cambió el esquema de la serie ${def.bcraId}; requiere revisión del catálogo`);
        const window = new Date(now); window.setUTCFullYear(window.getUTCFullYear() - 2);
        const from = full || !previous ? metadata.primerFechaInformada : [metadata.primerFechaInformada, window.toISOString().slice(0, 10)].sort().at(-1)!;
        const to = metadata.ultFechaInformada < today ? metadata.ultFechaInformada : today;
        // Series históricas finalizadas se reconcilian completas, sin pedir rangos invertidos.
        const effectiveFrom = from > to ? metadata.primerFechaInformada : from;
        const incoming = await client.observations(def.bcraId, effectiveFrom, to, def.scale, !!full);
        if (!incoming.length || !incoming.some(p => p.value !== null)) throw new Error('Serie vacía o sin valores válidos');
        const previousRange = previous?.observations.filter(p => p.date >= effectiveFrom && p.date <= to) ?? [];
        if (previousRange.length && incoming.filter(p => p.value !== null).length < previousRange.filter(p => p.value !== null).length * 0.8) throw new Error('Pérdida de más del20% de observaciones; se conserva la versión anterior');
        const oldMap = new Map(previousRange.map(p => [p.date, p.value]));
        const newMap = new Map(incoming.map(p => [p.date, p.value]));
        const lastPrevious = previous?.observations.at(-1)?.date ?? '';
        const seriesRevisions: MonetaryRevision[] = [];
        for (const date of new Set([...oldMap.keys(), ...newMap.keys()])) {
          if (!oldMap.has(date) && date > lastPrevious) continue;
          if (oldMap.has(date) && newMap.has(date) && oldMap.get(date) === newMap.get(date)) continue;
          seriesRevisions.push({ id: def.id, date, oldValue: oldMap.get(date) ?? null, newValue: newMap.get(date) ?? null, kind: !newMap.has(date) ? 'removed' : !oldMap.has(date) ? 'added_historical' : 'revised', detectedAt: timestamp, runId });
        }
        const observations = full || !previous ? incoming : reconcileObservations(previous.observations, incoming, effectiveFrom, to);
        writeMonetarySeries({ def: { ...def, firstDate: metadata.primerFechaInformada, lastDate: metadata.ultFechaInformada }, observations, retrievedAt: timestamp, stale: false }, dir);
        revisions.push(...seriesRevisions);
        manifest.series[def.id] = { count: observations.length, firstDate: observations[0]!.date, lastDate: observations.at(-1)!.date, retrievedAt: timestamp, stale: false };
        outcomes.push({ id: def.id, ok: true, count: observations.length });
        log(`BCRA ${def.bcraId} · ${def.shortName}: ${observations.length} observaciones${seriesRevisions.length ? `; ${seriesRevisions.length} revisiones` : ''}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (previous) writeMonetarySeries({ ...previous, stale: true, error: message }, dir);
        manifest.series[def.id] = { count: previous?.observations.length ?? 0, firstDate: previous?.observations[0]?.date ?? null, lastDate: previous?.observations.at(-1)?.date ?? null, retrievedAt: previous?.retrievedAt ?? '', stale: true, error: message };
        outcomes.push({ id: def.id, ok: false, count: previous?.observations.length ?? 0, error: message });
        log(`BCRA ${def.bcraId}: ${message}; último conjunto válido conservado`);
      }
    }
    const ok = outcomes.every(o => o.ok);
    if (outcomes.some(o => o.ok)) manifest.updatedAt = timestamp;
    if (full && ok && targets.length === MONETARY_CATALOG.length) manifest.lastFullAt = timestamp;
    writeJsonAtomic(path.join(dir, 'manifest.json'), manifest);
    if (revisions.length) fs.appendFileSync(path.join(dir, 'revisions.jsonl'), revisions.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    const result = { ok, partial: !ok && outcomes.some(o => o.ok), runId, updatedAt: manifest.updatedAt, full: !!full, outcomes, revisions: revisions.length };
    writeJsonAtomic(path.join('data/runs/monetary', `${runId.replace(/:/g, '-')}.json`), result);
    return result;
  } finally { release(); }
}
