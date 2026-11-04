/**
 * Store normalizado en archivos JSON (local, versionable, sin servidor).
 *
 * Estructura (STORE_DIR, por defecto ./data/store):
 *   manifest.json                 estado de la última corrida, por dataset y por serie
 *   series/<seriesId>.json        SeriesData (observaciones + meta)
 *   revisions.jsonl               registro de revisiones (append-only)
 *   nomenclaturas.json            diccionario de códigos de comercio exterior
 *
 * Escritura atómica: archivo temporal + rename. Nunca se escribe una serie
 * inválida sobre una válida (la validación ocurre antes, en la ingesta).
 *
 * Solo para uso en servidor / CLI (usa node:fs). NO importar desde componentes cliente.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Manifest, RevisionRecord, SeriesData } from './types';

export function storeDir(): string {
  if (process.env.STORE_DIR && process.env.STORE_DIR.trim()) return path.resolve(process.env.STORE_DIR.trim());
  if (process.env.DATA_MODE === 'fixtures') return path.resolve('data/store-fixtures');
  return path.resolve('data/store');
}

function seriesFile(dir: string, id: string): string {
  return path.join(dir, 'series', `${id}.json`);
}

export function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf8');
  fs.renameSync(tmp, file);
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export function emptyManifest(dataMode: Manifest['dataMode'] = 'real'): Manifest {
  return { schemaVersion: 1, dataMode, generatedAt: new Date().toISOString(), lastRun: null, datasets: {}, series: {} };
}

export function readManifest(dir = storeDir()): Manifest | null {
  return readJson<Manifest>(path.join(dir, 'manifest.json'));
}

export function writeManifest(m: Manifest, dir = storeDir()): void {
  writeJsonAtomic(path.join(dir, 'manifest.json'), m);
}

export function readSeriesData(id: string, dir = storeDir()): SeriesData | null {
  return readJson<SeriesData>(seriesFile(dir, id));
}

export function writeSeriesData(data: SeriesData, dir = storeDir()): void {
  writeJsonAtomic(seriesFile(dir, data.id), data);
}

export function listStoredSeries(dir = storeDir()): string[] {
  try {
    return fs
      .readdirSync(path.join(dir, 'series'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}

export function appendRevisions(records: RevisionRecord[], dir = storeDir()): void {
  if (!records.length) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'revisions.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

export function readRevisions(dir = storeDir(), limit?: number): RevisionRecord[] {
  let txt: string;
  try {
    txt = fs.readFileSync(path.join(dir, 'revisions.jsonl'), 'utf8');
  } catch {
    return [];
  }
  const lines = txt.split('\n').filter(Boolean);
  const sel = limit ? lines.slice(-limit) : lines;
  return sel.map((l) => JSON.parse(l) as RevisionRecord);
}

export function readNomenclaturas(dir = storeDir()): Record<string, Record<string, string>> | null {
  return readJson(path.join(dir, 'nomenclaturas.json'));
}

export function writeNomenclaturas(n: Record<string, Record<string, string>>, dir = storeDir()): void {
  writeJsonAtomic(path.join(dir, 'nomenclaturas.json'), n);
}
