/**
 * Store de combustibles (data/combustibles), separado del store INDEC y del monetario.
 *   manifest.json              estado de la última corrida y de cada serie
 *   series/<id>.json           FuelSeries
 *   revisions.jsonl            revisiones (append-only)
 *   state/surtidor.json        estado mínimo por estación/producto para la corrida diaria
 * Solo servidor / CLI (usa node:fs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from '../core/store';
import { FUEL_DEFS } from './defs';
import type { SurtidorState } from './surtidor';
import type { FuelManifest, FuelRevision, FuelSeries } from './types';

/** IDs almacenables (evita rutas arbitrarias). */
export const FUEL_ID = /^combustibles\.(surtidor|eess)\.(super|premium|gasoil_g2|gasoil_g3)\.(nacional|caba)$/;

export function combustiblesStoreDir(): string { return path.resolve(process.env.COMBUSTIBLES_STORE_DIR || 'data/combustibles'); }

function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

export function emptyFuelManifest(timestamp: string): FuelManifest {
  return {
    schemaVersion: 1, updatedAt: null, lastAttemptAt: timestamp,
    surtidor: { lastHistoricoAt: null, lastVigentesAt: null, lastEventAt: null, lastDay: null },
    eess: { lastVigenteAt: null, lastAnnualAt: null, lastPeriod: null },
    series: {},
  };
}
export function readFuelManifest(dir = combustiblesStoreDir()): FuelManifest | null { return readJson<FuelManifest>(path.join(dir, 'manifest.json')); }
export function writeFuelManifest(manifest: FuelManifest, dir = combustiblesStoreDir()): void { writeJsonAtomic(path.join(dir, 'manifest.json'), manifest); }

export function readFuelSeries(id: string, dir = combustiblesStoreDir()): FuelSeries | null {
  if (!FUEL_ID.test(id)) throw new Error('ID de combustibles inválido');
  return readJson<FuelSeries>(path.join(dir, 'series', `${id}.json`));
}
export function writeFuelSeries(series: FuelSeries, dir = combustiblesStoreDir()): void {
  if (!FUEL_ID.test(series.def.id)) throw new Error('ID de combustibles inválido');
  writeJsonAtomic(path.join(dir, 'series', `${series.def.id}.json`), series);
}

export function readSurtidorState(dir = combustiblesStoreDir()): SurtidorState | null { return readJson<SurtidorState>(path.join(dir, 'state', 'surtidor.json')); }
export function writeSurtidorState(state: SurtidorState, dir = combustiblesStoreDir()): void { writeJsonAtomic(path.join(dir, 'state', 'surtidor.json'), state); }

export function appendFuelRevisions(revisions: FuelRevision[], dir = combustiblesStoreDir()): void {
  if (!revisions.length) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'revisions.jsonl'), revisions.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

export interface FuelStore { series: FuelSeries[]; updatedAt: string | null; error?: string }

/** Lectura completa para el dashboard (servidor/build). La definición vigente sale de defs.ts. */
export function readFuelStore(dir = combustiblesStoreDir()): FuelStore {
  const series: FuelSeries[] = [];
  const errors: string[] = [];
  let updatedAt: string | null = null;
  try { updatedAt = readFuelManifest(dir)?.updatedAt ?? null; } catch { errors.push('Manifest de combustibles ilegible'); }
  for (const def of FUEL_DEFS) {
    try { const stored = readFuelSeries(def.id, dir); if (stored) series.push({ ...stored, def }); }
    catch { errors.push(`No se pudo leer ${def.shortName}`); }
  }
  return { series, updatedAt, ...(errors.length ? { error: errors.join('; ') } : {}) };
}
