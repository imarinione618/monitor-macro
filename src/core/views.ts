/**
 * Vistas tabulares compartidas: misma lógica para las pestañas CALCULOS_* de Sheets
 * y para las tablas/descargas del dashboard. Así una serie, período y transformación
 * dan el mismo número en ambos productos.
 */
import { comparePeriods, periodRange } from './periods';
import { allowedTransforms, applyTransform, TRANSFORMS, type TransformOptions } from './transforms';
import type { Frequency, Period, SeriesData, SeriesDef, TransformId, TransformedPoint } from './types';

export interface ColumnSpec {
  seriesId: string;
  transform: TransformId;
  opts?: TransformOptions;
}

export interface WideTable {
  frequency: Frequency;
  periods: Period[];
  columns: { key: string; seriesId: string; transform: TransformId; header: string; unit: string }[];
  /** values[col][row] */
  values: (number | null)[][];
}

/** Clave estable de columna: "<seriesId>|<transform>" (se usa como encabezado técnico en Sheets). */
export function columnKey(c: ColumnSpec): string {
  return `${c.seriesId}|${c.transform}`;
}

export function columnHeader(def: SeriesDef, t: TransformId): string {
  return t === 'level' ? `${def.shortName} (${def.unit})` : `${def.shortName} — ${TRANSFORMS[t].label} (${TRANSFORMS[t].unit(def.unit)})`;
}

/** Calcula una transformación validando que sea aplicable a la serie. */
export function transformSeries(def: SeriesDef, data: SeriesData, t: TransformId, opts?: TransformOptions): TransformedPoint[] {
  if (!allowedTransforms(def).includes(t)) {
    throw new Error(`Transformación "${t}" no válida para ${def.id} (${def.measure}, ${def.frequency}, ${def.seasonalAdjustment})`);
  }
  return applyTransform(data.observations, def.frequency, t, opts);
}

/**
 * Arma una tabla ancha alineada por período calendario (continuo, sin huecos de filas:
 * un período ausente aparece con null). Todas las series deben tener igual frecuencia.
 */
export function buildWideTable(
  cols: ColumnSpec[],
  getDef: (id: string) => SeriesDef,
  getData: (id: string) => SeriesData | null,
): WideTable {
  if (!cols.length) throw new Error('buildWideTable: sin columnas');
  const freqs = new Set(cols.map((c) => getDef(c.seriesId).frequency));
  if (freqs.size !== 1) throw new Error(`No se mezclan frecuencias en una tabla: ${[...freqs].join(', ')}`);
  const frequency = [...freqs][0]!;

  const computed = cols.map((c) => {
    const def = getDef(c.seriesId);
    const data = getData(c.seriesId);
    const pts = data ? transformSeries(def, data, c.transform, c.opts) : [];
    return { c, def, map: new Map(pts.map((p) => [p.period, p.value])), pts };
  });

  let min: Period | null = null, max: Period | null = null;
  for (const { pts } of computed)
    for (const p of pts) {
      if (min === null || comparePeriods(p.period, min) < 0) min = p.period;
      if (max === null || comparePeriods(p.period, max) > 0) max = p.period;
    }
  const periods = min && max ? periodRange(min, max) : [];

  return {
    frequency,
    periods,
    columns: computed.map(({ c, def }) => ({
      key: columnKey(c),
      seriesId: c.seriesId,
      transform: c.transform,
      header: columnHeader(def, c.transform),
      unit: TRANSFORMS[c.transform].unit(def.unit),
    })),
    values: computed.map(({ map }) => periods.map((p) => map.get(p) ?? null)),
  };
}

/**
 * Transformaciones "de cálculo" por defecto para una serie (CALCULOS_* en Sheets y
 * selector del dashboard): todas las válidas excepto nivel y base 100.
 */
export function defaultCalcTransforms(def: SeriesDef): TransformId[] {
  return allowedTransforms(def).filter((t) => t !== 'level' && t !== 'rebase_100');
}
