import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from '../core/store';
import { MONETARY_CATALOG } from './catalog';
import type { MonetaryManifest, MonetarySeries, MonetaryStore } from './types';

export function monetaryStoreDir(): string { return path.resolve(process.env.MONETARY_STORE_DIR || 'data/monetary'); }
export function readMonetaryManifest(dir = monetaryStoreDir()): MonetaryManifest | null {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export function readMonetarySeries(id: string, dir = monetaryStoreDir()): MonetarySeries | null {
  if (!/^monetario\.bcra\.\d+$/.test(id)) throw new Error('ID monetario inválido');
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'series', `${id}.json`), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export function writeMonetarySeries(series: MonetarySeries, dir = monetaryStoreDir()): void {
  if (!/^monetario\.bcra\.\d+$/.test(series.def.id)) throw new Error('ID monetario inválido');
  writeJsonAtomic(path.join(dir, 'series', `${series.def.id}.json`), series);
}
export function readMonetaryStore(dir = monetaryStoreDir()): MonetaryStore {
  const series: MonetarySeries[] = [];
  const errors: string[] = [];
  let updatedAt: string | null = null;
  try { updatedAt = readMonetaryManifest(dir)?.updatedAt ?? null; } catch { errors.push('Manifest monetario ilegible'); }
  for (const def of MONETARY_CATALOG) {
    try { const stored = readMonetarySeries(def.id, dir); if (stored) series.push({ ...stored, def: { ...def, firstDate: stored.def.firstDate, lastDate: stored.def.lastDate } }); }
    catch { errors.push(`No se pudo leer ${def.shortName}`); }
  }
  return { series, updatedAt, ...(errors.length ? { error: errors.join('; ') } : {}) };
}
