import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateFixtureStore } from '../../src/core/fixtures/generate';
import { loadStoreSource, type DataSource } from '../../src/sheets/source';
import type { SeriesData } from '../../src/core/types';

let cached: string | null = null;

/** Store sintético en un directorio temporal (una vez por proceso de test). */
export function fixtureStoreDir(): string {
  if (cached && fs.existsSync(path.join(cached, 'manifest.json'))) return cached;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'indec-sheets-store-'));
  generateFixtureStore(dir);
  cached = dir;
  return dir;
}

export function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Fuente con overrides en memoria (para simular revisiones / series nuevas). */
export function mutableSource(): { src: DataSource; overrides: Map<string, SeriesData | null> } {
  const base = loadStoreSource(fixtureStoreDir());
  const overrides = new Map<string, SeriesData | null>();
  const src: DataSource = {
    ...base,
    getData: (id) => (overrides.has(id) ? overrides.get(id)! : base.getData(id)),
  };
  return { src, overrides };
}

export const NOW = new Date('2026-11-04T12:00:00Z');
