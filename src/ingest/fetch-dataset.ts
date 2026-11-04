/**
 * Descarga de un dataset completo o de una ventana de períodos, aplicando
 * `select`, `fetchFilters` y el orden por clave primaria definidos en DATASETS.
 */
import type { DatasetConfig, Period } from '../core/types';
import { parsePeriod, toYYYYMM } from '../core/periods';
import type { FetchAllResult, IndecClient, QueryParams } from './client';
import { IngestError } from './errors';

/** Parámetros PostgREST (sin codificar) de la consulta de un dataset. */
export function datasetParams(ds: DatasetConfig, fromPeriod?: Period): QueryParams {
  const p: QueryParams = {};
  if (ds.select?.length) p.select = ds.select.join(',');
  for (const [k, v] of Object.entries(ds.fetchFilters ?? {})) p[k] = v;
  if (fromPeriod) {
    if (!ds.periodFilterField) throw new IngestError('config', `${ds.id}: no tiene periodFilterField para filtrar por ventana`);
    if (p[ds.periodFilterField] !== undefined) throw new IngestError('config', `${ds.id}: el filtro de período choca con fetchFilters`);
    const v = ds.periodFilterFormat === 'YYYY' ? String(parsePeriod(fromPeriod).year) : toYYYYMM(fromPeriod);
    p[ds.periodFilterField] = `gte.${v}`;
  }
  return p;
}

export async function fetchDatasetRows(
  client: IndecClient,
  ds: DatasetConfig,
  opts: { fromPeriod?: Period; onPage?: (got: number, total: number) => void } = {},
): Promise<FetchAllResult> {
  return client.fetchAll(ds.path, datasetParams(ds, opts.fromPeriod), ds.primaryKey, { onPage: opts.onPage });
}
