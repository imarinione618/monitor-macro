/**
 * Fuente de datos para Sheets: lectura del store normalizado (solo lectura).
 * Se abstrae en `DataSource` para poder inyectar datos en memoria en los tests.
 */
import path from 'node:path';
import { readManifest, readRevisions, readSeriesData, storeDir } from '../core/store';
import type { Manifest, RevisionRecord, SeriesData } from '../core/types';

export interface DataSource {
  manifest: Manifest | null;
  getData(id: string): SeriesData | null;
  revisions: RevisionRecord[];
  /** Descripción del origen (p.ej. "data/store-fixtures"). Sin rutas absolutas del usuario. */
  label: string;
}

/** Lee el store con caché por serie. Lanza si no hay manifest. */
export function loadStoreSource(dir = storeDir()): DataSource {
  const manifest = readManifest(dir);
  if (!manifest) {
    throw new Error(
      `No hay store en ${path.relative(process.cwd(), dir) || dir} (falta manifest.json). ` +
        'Corré `npm run data:refresh` (datos reales) o `npm run fixtures:generate` y DATA_MODE=fixtures (sintéticos).',
    );
  }
  const cache = new Map<string, SeriesData | null>();
  return {
    manifest,
    getData(id) {
      if (!cache.has(id)) cache.set(id, readSeriesData(id, dir));
      return cache.get(id) ?? null;
    },
    revisions: readRevisions(dir, 20000),
    label: path.relative(process.cwd(), dir).replace(/\\/g, '/') || dir,
  };
}

/** true si el store (o alguna serie) es sintético. */
export function isSyntheticSource(src: DataSource, seriesIds: string[]): boolean {
  if (src.manifest?.dataMode === 'synthetic') return true;
  return seriesIds.some((id) => src.getData(id)?.meta.synthetic === true);
}
