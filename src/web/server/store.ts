/**
 * Lectura del store para el dashboard — SOLO SERVIDOR (usa node:fs vía src/core/store).
 * No importar desde componentes cliente. Al cliente solo viajan objetos ClientSeries
 * (definición del registro + observaciones + metadatos de estado), sin URLs de consulta
 * ni credenciales.
 */
import path from 'node:path';
import { cache } from 'react';
import { DATASETS } from '@/core/datasets';
import { dependenciesOf, findSeries, SERIES } from '@/core/registry';
import { listStoredSeries, readManifest, readRevisions, readSeriesData, storeDir } from '@/core/store';
import type { DatasetId, Manifest, RevisionRecord, SeriesDef } from '@/core/types';
import type { ClientSeries, SourceRef } from '@/web/lib/types';

export type StoreStatus = 'ok' | 'empty' | 'error';

export interface StoreState {
  status: StoreStatus;
  manifest: Manifest | null;
  /** Ruta relativa al proyecto (para mensajes). */
  dirLabel: string;
  dataMode: 'real' | 'synthetic' | null;
  /** Fecha/hora de la última actualización (fin de la última corrida). */
  updatedAt: string | null;
  error?: string;
}

function relDir(dir: string): string {
  const rel = path.relative(process.cwd(), dir);
  return (rel && !rel.startsWith('..') ? rel : dir).replace(/\\/g, '/');
}

export const getStoreState = cache((): StoreState => {
  const dir = storeDir();
  const dirLabel = relDir(dir);
  try {
    const manifest = readManifest(dir);
    const stored = listStoredSeries(dir);
    if (!manifest && !stored.length) return { status: 'empty', manifest: null, dirLabel, dataMode: null, updatedAt: null };
    const dataMode = manifest?.dataMode ?? (process.env.DATA_MODE === 'fixtures' ? 'synthetic' : 'real');
    const updatedAt = manifest?.lastRun?.finishedAt ?? manifest?.generatedAt ?? null;
    return { status: stored.length ? 'ok' : 'empty', manifest, dirLabel, dataMode, updatedAt };
  } catch (e) {
    return {
      status: 'error',
      manifest: null,
      dirLabel,
      dataMode: null,
      updatedAt: null,
      error: `No se pudo leer el store (${dirLabel}): ${(e as Error).message}`,
    };
  }
});

function datasetsOf(def: SeriesDef, depth = 0): DatasetId[] {
  if (def.source.kind === 'api') return [def.source.dataset];
  if (depth > 3) return [];
  return dependenciesOf(def).flatMap((id) => {
    const d = findSeries(id);
    return d ? datasetsOf(d, depth + 1) : [];
  });
}

export function sourcesOf(def: SeriesDef): SourceRef[] {
  const ids = [...new Set(datasetsOf(def))];
  return ids.map((id) => {
    const ds = DATASETS[id];
    return { title: ds?.title ?? id, producer: ds?.producer, methodologyUrl: ds?.methodologyUrl };
  });
}

/** Lee una serie del store y la prepara para el cliente. Nunca lanza: los errores se reflejan en el objeto. */
export const getClientSeries = cache((id: string): ClientSeries | null => {
  const def = findSeries(id);
  if (!def) return null;
  const state = getStoreState();
  const m = state.manifest?.series[id];
  let data = null;
  let error = m?.error;
  try {
    data = state.status === 'error' ? null : readSeriesData(id, storeDir());
  } catch (e) {
    error = `Archivo de serie ilegible: ${(e as Error).message}`;
  }
  return {
    def,
    observations: data?.observations ?? [],
    missing: !data || !data.observations.length,
    firstPeriod: data?.meta.firstPeriod ?? m?.firstPeriod ?? null,
    lastPeriod: data?.meta.lastPeriod ?? m?.lastPeriod ?? null,
    retrievedAt: data?.meta.retrievedAt ?? m?.retrievedAt ?? null,
    stale: !!(data?.meta.stale || m?.stale),
    error,
    synthetic: !!data?.meta.synthetic || state.dataMode === 'synthetic',
    suppressedRows: data?.meta.suppressedRows,
    sources: sourcesOf(def),
  };
});

/** Varias series por ID (ignora IDs desconocidos). */
export function getClientSeriesList(ids: string[]): ClientSeries[] {
  return ids.map((id) => getClientSeries(id)).filter((s): s is ClientSeries => !!s);
}

/** Series de una familia + sus variantes de ajuste estacional (pool para un gráfico). */
export function familyPool(family: string): ClientSeries[] {
  const ids = new Set<string>();
  for (const s of SERIES.filter((x) => x.family === family)) {
    ids.add(s.id);
    for (const v of Object.values(s.seasonalVariants ?? {})) if (v) ids.add(v);
  }
  return getClientSeriesList([...ids]);
}

/** Pool con variantes para una lista de IDs. */
export function poolWithVariants(ids: string[]): ClientSeries[] {
  const all = new Set<string>();
  for (const id of ids) {
    all.add(id);
    const d = findSeries(id);
    for (const v of Object.values(d?.seasonalVariants ?? {})) if (v) all.add(v);
  }
  return getClientSeriesList([...all]);
}

export function getRecentRevisions(limit = 60): RevisionRecord[] {
  try {
    return readRevisions(storeDir(), 2000).slice(-limit).reverse();
  } catch {
    return [];
  }
}
