import { prepareComposition, prepareSeries } from '@/monetary/analytics';
import type { MonetarySeries } from '@/monetary/types';
import { CSV_BOM, CSV_SEP, csvNumber } from './csv';

export type MonetaryOptions = Parameters<typeof prepareSeries>[1];
export type MonetaryPoint = ReturnType<typeof prepareSeries>[number];
export type IpcPoint = { period: string; value: number | null };
export interface MonetaryChartColumn { series: MonetarySeries; points: MonetaryPoint[]; values: (number | null)[] }
export interface MonetaryChartModel { periods: string[]; columns: MonetaryChartColumn[]; unit: string; subtitle: string; source: string }

export const SECTOR_LABELS = { private: 'Sector privado', public: 'Sector público', total: 'Total', bcra: 'BCRA', other: 'Otra cobertura' };
export const TRANSFORM_LABELS = { level: 'Nivel', pct_mom: 'Variación mensual (%)', pct_yoy: 'Variación interanual (%)', absolute_mom: 'Cambio mensual de saldo', change_pp: 'Cambio en puntos porcentuales', change_bp: 'Cambio en puntos básicos', base100: 'Índice base 100' };

/** Fuente según proveedores presentes: BCRA, A3 Mercados o ambos. */
export function monetarySourceLabel(series: Pick<MonetarySeries, 'def'>[]): string {
  const a3 = series.some(s => s.def.provider === 'A3');
  const bcra = series.some(s => (s.def.provider ?? 'BCRA') === 'BCRA');
  return `Fuente: one618 en base a ${[bcra ? 'BCRA' : '', a3 ? 'A3 Mercados' : ''].filter(Boolean).join(' y ')}`;
}

export function monetaryDate(period: string): string {
  const [year, month, day] = period.split('-');
  if (day) return `${day}/${month}/${year}`;
  return `${month}/${year}`;
}

export function buildMonetaryChartModel(series: MonetarySeries[], options: MonetaryOptions, ipc: IpcPoint[], allSeries: MonetarySeries[], composition = false): MonetaryChartModel {
  const commonPoints = composition ? prepareComposition(series, options, ipc) : null;
  const columns = series.map((s, i) => ({ series: s, points: commonPoints?.[i] ?? prepareSeries(s, options, ipc, allSeries), values: [] as (number | null)[] }));
  const periods = [...new Set(columns.flatMap(c => c.points.map(p => p.period)))].sort();
  for (const c of columns) {
    const byPeriod = new Map(c.points.map(p => [p.period, p.value]));
    c.values = periods.map(p => byPeriod.get(p) ?? null);
  }
  const unit = options.transform === 'base100' ? 'Índice base 100' : options.transform === 'change_pp' ? 'Puntos porcentuales' : options.transform === 'change_bp' ? 'Puntos básicos' : options.transform.startsWith('pct_') ? '%' : series[0]?.def.unit ?? '';
  const currencies = [...new Set(series.map(s => s.def.currency).filter(Boolean))].join(', ');
  const sectors = [...new Set(series.map(s => SECTOR_LABELS[s.def.sector]))].join(', ');
  const base = options.basePeriod ?? ipc.filter(p => p.value !== null).at(-1)?.period;
  const price = options.valueMode === 'real' ? `Pesos constantes de ${base ? monetaryDate(base) : 'mes sin IPC'}` : series.some(s => s.def.kind === 'stock') && unit !== '%' ? 'Valores nominales' : '';
  const ratio = series.some(s => s.def.category === 'ratio');
  const frequency = options.frequency === 'D' ? 'Diaria' : options.monthlyMode === 'close' ? ratio ? 'Ratio al cierre mensual común' : 'Cierre mensual' : ratio ? 'Promedio de ratios diarios' : 'Promedio mensual';
  const range = periods.length ? `${monetaryDate(periods[0]!)}–${monetaryDate(periods.at(-1)!)}` : 'Sin observaciones';
  const partialDates = columns.flatMap(c => c.points.filter(p => p.partial && p.value !== null).map(p => p.effectiveDate)).sort();
  const partialLabel = partialDates.length ? `Mes parcial; corte hasta ${monetaryDate(partialDates.at(-1)!)}` : '';
  const rateChange = options.transform === 'change_pp' || options.transform === 'change_bp';
  const comparison = rateChange ? options.frequency === 'D' ? 'Contra observación previa' : 'Contra mes anterior' : '';
  const subtitle = [TRANSFORM_LABELS[options.transform], comparison, unit, currencies, sectors, frequency, price, options.transform === 'base100' && options.basePeriod ? `Base ${monetaryDate(options.basePeriod)} = 100` : '', options.transform === 'pct_mom' ? 'Sin ajuste estacional' : '', range, partialLabel].filter(Boolean).join(' · ');
  const source = `${monetarySourceLabel(series)}${options.valueMode === 'real' ? ' e INDEC' : ''}.`;
  return { periods, columns, unit, subtitle, source };
}

function quote(value: string): string { return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value; }

/** La descarga usa exactamente las filas y valores del modelo visible, incluyendo corte y parcialidad. */
export function monetaryChartCsv(model: MonetaryChartModel): string {
  const headers = ['periodo', ...model.columns.flatMap(c => [`${c.series.def.name} [${model.subtitle}]`, `${c.series.def.shortName}: fecha efectiva`, `${c.series.def.shortName}: parcial`, `${c.series.def.shortName}: observaciones`])];
  const maps = model.columns.map(c => new Map(c.points.map(p => [p.period, p])));
  const lines = model.periods.map((period, i) => [period, ...model.columns.flatMap((c, j) => {
    const point = maps[j]!.get(period);
    return [csvNumber(c.values[i]), point?.effectiveDate ?? '', point ? point.partial ? 'sí' : 'no' : '', point ? String(point.coverageCount) : ''];
  })].map(quote).join(CSV_SEP));
  return CSV_BOM + [headers.map(quote).join(CSV_SEP), ...lines].join('\r\n') + '\r\n';
}
