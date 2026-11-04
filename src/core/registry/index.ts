/**
 * Registro de series: fuente de verdad de QUÉ se descarga, cómo se identifica y
 * cómo se presenta. Agregar una serie = agregar un SeriesDef (ver docs/agregar-serie.md).
 */
import type { DatasetId, SeriesDef, Topic } from '../types';
import { ACTIVIDAD, ACTIVIDAD_NO_DISPONIBLE } from './actividad';
import { LABORAL, LABORAL_COMPLEMENTARIAS } from './laboral';
import { PRECIOS } from './precios';
import { COMEX, COMEX_NO_DISPONIBLE } from './comex';
import { DATASETS } from '../datasets';

export const SERIES: SeriesDef[] = [...ACTIVIDAD, ...LABORAL, ...PRECIOS, ...COMEX];

export { ACTIVIDAD_NO_DISPONIBLE, LABORAL_COMPLEMENTARIAS, COMEX_NO_DISPONIBLE };

const BY_ID = new Map(SERIES.map((s) => [s.id, s]));

export function getSeries(id: string): SeriesDef {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`Serie desconocida: ${id}`);
  return s;
}

export function findSeries(id: string): SeriesDef | undefined {
  return BY_ID.get(id);
}

export function seriesByTopic(topic: Topic): SeriesDef[] {
  return SERIES.filter((s) => s.topic === topic);
}

export function seriesByDataset(dataset: DatasetId): SeriesDef[] {
  return SERIES.filter((s) => s.source.kind === 'api' && s.source.dataset === dataset);
}

/** Datasets necesarios para el registro actual (incluye dependencias de series derivadas). */
export function requiredDatasets(): DatasetId[] {
  const set = new Set<DatasetId>();
  for (const s of SERIES) if (s.source.kind === 'api') set.add(s.source.dataset);
  return [...set];
}

/** IDs de los que depende una serie derivada (orden topológico simple: un nivel). */
export function dependenciesOf(def: SeriesDef): string[] {
  if (def.source.kind !== 'derived') return [];
  const op = def.source.op;
  switch (op.type) {
    case 'difference':
      return [op.minuend, op.subtrahend];
    case 'real_index':
      return [op.nominal, op.deflator];
    case 'sum':
      return op.inputs;
  }
}

export function headlineSeries(): SeriesDef[] {
  return SERIES.filter((s) => s.headline).sort((a, b) => a.headline!.order - b.headline!.order);
}

/** Validación estática del registro (IDs únicos, dependencias existentes, datasets conocidos). */
export function validateRegistry(series: SeriesDef[] = SERIES): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const s of series) {
    if (seen.has(s.id)) errors.push(`ID duplicado: ${s.id}`);
    seen.add(s.id);
    if (!/^[a-z0-9_.]+$/.test(s.id)) errors.push(`ID con caracteres no permitidos: ${s.id}`);
    if (s.source.kind === 'api' && !DATASETS[s.source.dataset]) errors.push(`${s.id}: dataset desconocido ${s.source.dataset}`);
    for (const d of dependenciesOf(s)) if (!series.some((x) => x.id === d)) errors.push(`${s.id}: dependencia inexistente ${d}`);
    for (const v of Object.values(s.seasonalVariants ?? {})) if (v && !series.some((x) => x.id === v)) errors.push(`${s.id}: variante inexistente ${v}`);
  }
  return errors;
}
