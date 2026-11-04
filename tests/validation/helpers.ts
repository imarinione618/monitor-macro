/**
 * Utilidades de las pruebas de validación contra el STORE REAL (data/store).
 *
 * Estas pruebas no usan fixtures: leen lo descargado de la API oficial por
 * `npm run data:refresh`. Si el store real no existe (o es sintético), se saltean
 * con un mensaje claro en lugar de fallar.
 *
 * La ruta es explícita (no depende de STORE_DIR / DATA_MODE del entorno).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readManifest, readSeriesData } from '../../src/core/store';
import type { Manifest, Observation, SeriesData } from '../../src/core/types';

export const REAL_STORE_DIR = path.resolve('data/store');

export interface RealStoreStatus {
  ok: boolean;
  reason: string;
  manifest: Manifest | null;
}

export function realStoreStatus(dir = REAL_STORE_DIR): RealStoreStatus {
  let manifest: Manifest | null = null;
  try {
    manifest = readManifest(dir);
  } catch (e) {
    return { ok: false, reason: `manifest ilegible en ${dir}: ${(e as Error).message}`, manifest: null };
  }
  if (!manifest) return { ok: false, reason: `no existe ${path.join(dir, 'manifest.json')} (correr \`npm run data:refresh\`)`, manifest };
  if (manifest.dataMode !== 'real') return { ok: false, reason: `el store en ${dir} es "${manifest.dataMode}", no real`, manifest };
  if (!fs.existsSync(path.join(dir, 'series'))) return { ok: false, reason: `falta ${path.join(dir, 'series')}`, manifest };
  return { ok: true, reason: '', manifest };
}

/** Estado del store real + aviso visible si las pruebas se van a saltear. */
export function requireRealStore(suite: string): RealStoreStatus {
  const st = realStoreStatus();
  if (!st.ok) console.warn(`[validación] SE SALTEA "${suite}": ${st.reason}.`);
  return st;
}

export function load(id: string, dir = REAL_STORE_DIR): SeriesData {
  const d = readSeriesData(id, dir);
  if (!d) throw new Error(`La serie ${id} no está en ${dir}`);
  return d;
}

export function valueMap(obs: Observation[]): Map<string, number | null> {
  return new Map(obs.map((o) => [o.period, o.value]));
}

/** Copia el store real (manifest + series + nomenclaturas) a un directorio temporal. */
export function copyStoreToTmp(dir = REAL_STORE_DIR): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'indec-validacion-'));
  fs.cpSync(dir, tmp, { recursive: true });
  return tmp;
}
