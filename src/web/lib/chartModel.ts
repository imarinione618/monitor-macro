/**
 * Lógica pura de los gráficos: transformaciones válidas, compatibilidad de series,
 * variantes de ajuste estacional, rango temporal y armado de la tabla visible.
 *
 * Toda transformación se calcula con la capa compartida (src/core/views.ts →
 * src/core/transforms.ts): mismos números que en Google Sheets.
 */
import { PERIODS_PER_YEAR } from '@/core/periods';
import { allowedTransforms, ALLOWED_BY_MEASURE, SA_LABELS, TRANSFORMS } from '@/core/transforms';
import type { Frequency, Period, SeasonalAdjustment, SeriesData, SeriesDef, TransformId } from '@/core/types';
import { buildWideTable, type ColumnSpec } from '@/core/views';
import { RANGE_YEARS, type ClientSeries, type RangeId } from './types';

/** Orden de presentación de las transformaciones en los selectores. */
export const TRANSFORM_ORDER: TransformId[] = [
  'level',
  'pct_prev',
  'pct_yoy',
  'pct_ytd',
  'ytd_avg_pct_yoy',
  'diff_prev_pp',
  'diff_yoy_pp',
  'diff_yoy_abs',
  'ytd_sum',
  'ytd_sum_pct_yoy',
  'sum_12m',
  'sum_12m_pct_yoy',
  'rebase_100',
];

/** Transformaciones aditivas (se pueden apilar en barras). */
export const ADDITIVE_TRANSFORMS: TransformId[] = ['level', 'ytd_sum', 'sum_12m'];

/** Etiqueta de la transformación adaptada a la frecuencia ("Var. % mensual", "Var. % trimestral"). */
export function transformLabel(t: TransformId, f: Frequency): string {
  const per = f === 'M' ? 'mensual' : f === 'Q' ? 'trimestral' : f === 'S' ? 'semestral' : 'anual';
  switch (t) {
    case 'pct_prev':
      return `Var. % ${per}`;
    case 'diff_prev_pp':
      return `Dif. ${per} (p.p.)`;
    case 'sum_12m':
      return f === 'Q' ? 'Suma últimos 4 trimestres' : f === 'S' ? 'Suma últimos 2 semestres' : TRANSFORMS[t].label;
    case 'sum_12m_pct_yoy':
      return f === 'Q' ? 'Suma 4 trimestres, var. % i.a.' : f === 'S' ? 'Suma 2 semestres, var. % i.a.' : TRANSFORMS[t].label;
    default:
      return TRANSFORMS[t].label;
  }
}

/** Unidad resultante de aplicar t a la serie. */
export function transformedUnit(def: Pick<SeriesDef, 'unit'>, t: TransformId): string {
  return TRANSFORMS[t].unit(def.unit);
}

export interface TransformChoice {
  id: TransformId;
  label: string;
  enabled: boolean;
  /** Motivo por el que no está habilitada (se muestra como ayuda). */
  reason?: string;
}

const MEASURE_LABELS: Record<SeriesDef['measure'], string> = {
  index: 'índices',
  rate: 'tasas',
  flow: 'flujos',
  balance: 'saldos',
  price_level: 'valores en pesos',
  published_change: 'variaciones publicadas',
  weight: 'ponderaciones',
  incidence: 'incidencias',
};

function disabledReason(def: SeriesDef, t: TransformId): string {
  if (!ALLOWED_BY_MEASURE[def.measure].includes(t)) return `No aplica a ${MEASURE_LABELS[def.measure]} (${def.shortName}).`;
  if (t === 'pct_ytd' && def.topic === 'actividad')
    return 'En actividad, la variación acumulada se mide contra igual tramo del año anterior (usar "Var. % acumulada i.a."), no contra diciembre.';
  if (t === 'ytd_avg_pct_yoy' && def.topic !== 'actividad')
    return 'Para precios y salarios la variación acumulada es contra diciembre del año anterior.';
  if (t === 'pct_ytd' && def.frequency !== 'M') return 'La variación acumulada vs diciembre requiere serie mensual.';
  if (t === 'diff_prev_pp' && def.measure === 'rate' && def.seasonalAdjustment === 'original')
    return 'Tasa sin desestacionalizar: se compara contra el mismo período del año anterior (dif. interanual en p.p.).';
  if (t === 'pct_prev' && def.topic === 'actividad' && def.seasonalAdjustment === 'original')
    return 'En actividad, la variación vs el período anterior solo se calcula sobre la serie desestacionalizada o tendencia-ciclo (la original mezcla estacionalidad). Cambiá el ajuste.';
  if (def.frequency === 'A') return 'No aplica a series anuales.';
  return `No válida para ${def.shortName}.`;
}

/**
 * Opciones del selector de transformación para un conjunto de series ya resuelto.
 * Se listan las transformaciones que la naturaleza de alguna serie admite; se habilitan
 * solo si son válidas para TODAS (allowedTransforms) y producen una única unidad.
 */
export function transformChoices(defs: SeriesDef[]): TransformChoice[] {
  if (!defs.length) return [];
  const freq = defs[0]!.frequency;
  const listed = TRANSFORM_ORDER.filter((t) => defs.some((d) => ALLOWED_BY_MEASURE[d.measure].includes(t)));
  return listed.map((t) => {
    const label = transformLabel(t, freq);
    const bad = defs.find((d) => !allowedTransforms(d).includes(t));
    if (bad) return { id: t, label, enabled: false, reason: disabledReason(bad, t) };
    const units = new Set(defs.map((d) => transformedUnit(d, t)));
    if (units.size > 1) return { id: t, label, enabled: false, reason: 'Las series seleccionadas tienen unidades distintas con esta transformación.' };
    return { id: t, label, enabled: true };
  });
}

export function validTransformIds(defs: SeriesDef[]): TransformId[] {
  return transformChoices(defs)
    .filter((c) => c.enabled)
    .map((c) => c.id);
}

/** Elige `wanted` si es válida; si no, la primera válida de `fallbacks`, o la primera habilitada. */
export function pickTransform(defs: SeriesDef[], wanted: TransformId, fallbacks: TransformId[] = []): TransformId | null {
  const valid = validTransformIds(defs);
  if (valid.includes(wanted)) return wanted;
  for (const f of fallbacks) if (valid.includes(f)) return f;
  return valid[0] ?? null;
}

export interface Compatibility {
  ok: boolean;
  reason?: string;
}

/**
 * ¿Se puede agregar `candidate` a un gráfico con `selected` y transformación `t`?
 * Misma frecuencia (nunca se mezclan), transformación válida y misma unidad resultante.
 */
export function compatibility(candidate: SeriesDef, selected: SeriesDef[], t: TransformId): Compatibility {
  if (!selected.length) return { ok: true };
  const ref = selected[0]!;
  if (candidate.frequency !== ref.frequency) return { ok: false, reason: 'Frecuencia distinta: no se mezclan frecuencias en un gráfico.' };
  if (!allowedTransforms(candidate).includes(t)) return { ok: false, reason: `La transformación "${transformLabel(t, ref.frequency)}" no es válida para esta serie.` };
  if (transformedUnit(candidate, t) !== transformedUnit(ref, t)) return { ok: false, reason: `Unidad distinta (${candidate.unit}).` };
  return { ok: true };
}

// ------------------------------------------------------------ ajuste estacional

export const ADJUSTMENT_ORDER: SeasonalAdjustment[] = ['original', 'desestacionalizada', 'tendencia-ciclo'];

export function adjustmentLabel(a: SeasonalAdjustment): string {
  return SA_LABELS[a];
}

/** ID de la variante con el ajuste pedido (o el mismo ID si la serie no tiene variantes). */
export function resolveVariant(def: SeriesDef, adj: SeasonalAdjustment | null): string {
  if (!adj || !def.seasonalVariants) return def.id;
  return def.seasonalVariants[adj] ?? def.id;
}

/** Ajustes disponibles para TODAS las series seleccionadas (con datos en el pool). */
export function availableAdjustments(selected: SeriesDef[], pool: Record<string, ClientSeries>): SeasonalAdjustment[] {
  if (!selected.length || !selected.every((d) => d.seasonalVariants)) return [];
  return ADJUSTMENT_ORDER.filter((a) =>
    selected.every((d) => {
      const id = d.seasonalVariants?.[a];
      return !!id && !!pool[id] && !pool[id]!.missing;
    }),
  );
}

// ------------------------------------------------------------ modelo del gráfico

export interface ChartColumn {
  id: string;
  name: string;
  fullName: string;
  header: string;
  values: (number | null)[];
}

export interface ChartModel {
  frequency: Frequency;
  transform: TransformId;
  transformLabel: string;
  unit: string;
  /** Períodos visibles (rango aplicado, continuos). */
  periods: Period[];
  columns: ChartColumn[];
  /** Períodos elegibles como base 100 (todas las series con dato positivo). */
  baseCandidates: Period[];
  basePeriod: Period | null;
  /** true si no hay ningún valor para mostrar. */
  empty: boolean;
}

export function toSeriesData(s: ClientSeries): SeriesData {
  return {
    id: s.def.id,
    observations: s.observations,
    meta: {
      firstPeriod: s.firstPeriod,
      lastPeriod: s.lastPeriod,
      retrievedAt: s.retrievedAt ?? '',
      runId: '',
    },
  };
}

/** Índices [start, end] del rango visible sobre una grilla continua de períodos. */
export function visibleWindow(values: (number | null)[][], frequency: Frequency, range: RangeId): [number, number] | null {
  const n = values[0]?.length ?? 0;
  const has = (i: number) => values.some((col) => col[i] !== null && col[i] !== undefined);
  let last = -1;
  for (let i = n - 1; i >= 0; i--) if (has(i)) { last = i; break; }
  if (last < 0) return null;
  let first = 0;
  while (first < last && !has(first)) first++;
  const years = RANGE_YEARS[range];
  const start = years === null ? first : Math.max(first, last - years * PERIODS_PER_YEAR[frequency] + 1);
  return [start, last];
}

export interface BuildChartModelInput {
  series: ClientSeries[];
  transform: TransformId;
  range: RangeId;
  /** Para rebase_100. null = primer período visible. */
  basePeriod?: Period | null;
}

export function buildChartModel({ series, transform, range, basePeriod = null }: BuildChartModelInput): ChartModel | null {
  const usable = series.filter((s) => !s.missing);
  if (!usable.length) return null;
  const defs = new Map(usable.map((s) => [s.def.id, s.def]));
  const datas = new Map(usable.map((s) => [s.def.id, toSeriesData(s)]));
  const getDef = (id: string) => defs.get(id)!;
  const getData = (id: string) => datas.get(id) ?? null;
  const freq = usable[0]!.def.frequency;

  let baseCandidates: Period[] = [];
  let chosenBase: Period | null = null;
  let table;

  if (transform === 'rebase_100') {
    const lvl = buildWideTable(usable.map((s) => ({ seriesId: s.def.id, transform: 'level' })), getDef, getData);
    baseCandidates = lvl.periods.filter((_, i) => lvl.values.every((col) => (col[i] ?? null) !== null && col[i]! > 0));
    const win = visibleWindow(lvl.values, freq, range);
    if (!win || !baseCandidates.length) return emptyModel(freq, transform, usable);
    const visible = new Set(lvl.periods.slice(win[0], win[1] + 1));
    chosenBase =
      basePeriod && baseCandidates.includes(basePeriod) ? basePeriod : (baseCandidates.find((p) => visible.has(p)) ?? baseCandidates[0]!);
    const cols: ColumnSpec[] = usable.map((s) => ({ seriesId: s.def.id, transform, opts: { basePeriod: chosenBase! } }));
    table = buildWideTable(cols, getDef, getData);
  } else {
    table = buildWideTable(usable.map((s) => ({ seriesId: s.def.id, transform })), getDef, getData);
  }

  const win = visibleWindow(table.values, freq, range);
  if (!win) return emptyModel(freq, transform, usable);
  const [a, b] = win;
  const unit = table.columns[0]!.unit;
  return {
    frequency: freq,
    transform,
    transformLabel: transformLabel(transform, freq),
    unit,
    periods: table.periods.slice(a, b + 1),
    columns: table.columns.map((c, i) => {
      const def = getDef(c.seriesId);
      return {
        id: c.seriesId,
        name: def.shortName,
        fullName: def.name,
        header: c.header,
        values: table.values[i]!.slice(a, b + 1),
      };
    }),
    baseCandidates,
    basePeriod: chosenBase,
    empty: false,
  };
}

function emptyModel(freq: Frequency, transform: TransformId, usable: ClientSeries[]): ChartModel {
  return {
    frequency: freq,
    transform,
    transformLabel: transformLabel(transform, freq),
    unit: transformedUnit(usable[0]!.def, transform),
    periods: [],
    columns: [],
    baseCandidates: [],
    basePeriod: null,
    empty: true,
  };
}

// ------------------------------------------------------------ vista "último período" (barras)

export interface SnapshotRow {
  id: string;
  name: string;
  value: number | null;
  isReference: boolean;
}

export interface SnapshotModel {
  period: Period;
  transform: TransformId;
  transformLabel: string;
  unit: string;
  rows: SnapshotRow[];
  /** Períodos disponibles para elegir (con al menos un valor). */
  periods: Period[];
}

/**
 * Corte transversal en un período: valor de la transformación para cada serie,
 * ordenado de mayor a menor (la referencia, si existe, va primero).
 */
export function buildSnapshotModel(series: ClientSeries[], transform: TransformId, period: Period | null, referenceId?: string): SnapshotModel | null {
  const usable = series.filter((s) => !s.missing && allowedTransforms(s.def).includes(transform));
  if (!usable.length) return null;
  const defs = new Map(usable.map((s) => [s.def.id, s.def]));
  const datas = new Map(usable.map((s) => [s.def.id, toSeriesData(s)]));
  const table = buildWideTable(
    usable.map((s) => ({ seriesId: s.def.id, transform })),
    (id) => defs.get(id)!,
    (id) => datas.get(id) ?? null,
  );
  const periods = table.periods.filter((_, i) => table.values.some((col) => col[i] !== null));
  if (!periods.length) return null;
  const p = period && periods.includes(period) ? period : periods[periods.length - 1]!;
  const idx = table.periods.indexOf(p);
  const rows: SnapshotRow[] = table.columns.map((c, i) => ({
    id: c.seriesId,
    name: defs.get(c.seriesId)!.shortName,
    value: table.values[i]![idx] ?? null,
    isReference: c.seriesId === referenceId,
  }));
  rows.sort((x, y) => {
    if (x.isReference !== y.isReference) return x.isReference ? -1 : 1;
    if (x.value === null) return 1;
    if (y.value === null) return -1;
    return y.value - x.value;
  });
  return {
    period: p,
    transform,
    transformLabel: transformLabel(transform, table.frequency),
    unit: table.columns[0]!.unit,
    rows,
    periods,
  };
}
