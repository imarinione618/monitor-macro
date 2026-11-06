/**
 * Laboratorio: combinación libre de variables del monitor.
 *
 * Reglas (las mismas del proyecto):
 *  - Conversión de frecuencia explícita (promedio, último o suma) y solo hacia frecuencias más bajas.
 *    Mensual→trimestral/anual y trimestral→anual exigen el período completo; diaria→mensual usa
 *    las observaciones publicadas (el último período puede ser parcial y se marca).
 *  - Faltante = null; sin interpolar ni arrastrar. Comparaciones por calendario.
 *  - Precios constantes: × IPC(base) / IPC(t), con el IPC nacional convertido a la misma frecuencia por promedio.
 *  - Para frecuencias M/Q/S/A las transformaciones usan src/core/transforms.ts (implementación única).
 */
import { applyTransform } from '@/core/transforms';
import { makePeriod, parsePeriod, shiftPeriod } from '@/core/periods';
import type { Observation, TransformId } from '@/core/types';
import { LAB_FREQ_ORDER, type LabFrequency, type LabSeriesData, type LabSeriesMeta } from './labTypes';

export type Aggregation = 'mean' | 'last' | 'sum';
export type LabTransform = 'level' | 'pct_prev' | 'pct_yoy' | 'diff_prev' | 'diff_yoy' | 'rebase_100' | 'ln' | 'sum_12m' | 'ytd_sum';
export type Axis = 'left' | 'right';
export type LabChartType = 'line' | 'bar' | 'area';

export const AGGREGATION_LABELS: Record<Aggregation, string> = { mean: 'Promedio', last: 'Último dato', sum: 'Suma' };
export const LAB_TRANSFORM_LABELS: Record<LabTransform, string> = {
  level: 'Nivel', pct_prev: 'Var. % vs período anterior', pct_yoy: 'Var. % interanual', diff_prev: 'Diferencia vs período anterior',
  diff_yoy: 'Diferencia interanual', rebase_100: 'Índice base 100 (primer período visible)', ln: 'Logaritmo natural', sum_12m: 'Suma móvil de 12 meses / 4 trimestres', ytd_sum: 'Acumulado del año',
};
export const SCALES = [
  { value: 1, label: '× 1' }, { value: 100, label: '× 100' }, { value: 0.001, label: '÷ 1.000' }, { value: 0.000001, label: '÷ 1.000.000' }, { value: 1e-9, label: '÷ 1.000.000.000' },
] as const;

export interface LabItemBase { key: string; label: string; axis: Axis; type: LabChartType; transform: LabTransform; scale: number; real: boolean; aggregation: Aggregation }
export interface LabSeriesItem extends LabItemBase { kind: 'series'; id: string }
export type RatioOp = 'div' | 'mul' | 'sub' | 'add';
export interface LabRatioItem extends LabItemBase { kind: 'ratio'; a: string; b: string; op: RatioOp }
export type LabItem = LabSeriesItem | LabRatioItem;
export const RATIO_LABELS: Record<RatioOp, string> = { div: 'A ÷ B', mul: 'A × B', sub: 'A − B', add: 'A + B' };

export type Point = [string, number | null];

const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

export function coarser(a: LabFrequency, b: LabFrequency): LabFrequency {
  return LAB_FREQ_ORDER.indexOf(a) >= LAB_FREQ_ORDER.indexOf(b) ? a : b;
}
export function canConvert(from: LabFrequency, to: LabFrequency): boolean {
  if (from === to) return true;
  if (from === 'Q' && to === 'S') return false;
  if (from === 'S' && to === 'Q') return false;
  return LAB_FREQ_ORDER.indexOf(to) > LAB_FREQ_ORDER.indexOf(from);
}
export function defaultAggregation(meta: Pick<LabSeriesMeta, 'nature'>): Aggregation {
  return meta.nature === 'flow' || meta.nature === 'balance' ? 'sum' : 'mean';
}

/** Período destino de una fecha/período origen. */
export function targetPeriod(p: string, from: LabFrequency, to: LabFrequency): string {
  if (from === to) return p;
  const year = Number(p.slice(0, 4));
  if (to === 'A') return String(year);
  if (from === 'D' || from === 'M') {
    const month = Number(p.slice(5, 7));
    if (to === 'M') return p.slice(0, 7);
    if (to === 'Q') return makePeriod(year, Math.floor((month - 1) / 3) + 1, 'Q');
    if (to === 'S') return makePeriod(year, month <= 6 ? 1 : 2, 'S');
  }
  throw new Error(`Conversión no soportada: ${from} → ${to}`);
}

const SUBS: Record<LabFrequency, number> = { D: 0, M: 1, Q: 3, S: 6, A: 12 };
/** Cantidad de períodos origen que componen un período destino completo (null = diaria, sin exigencia). */
function required(from: LabFrequency, to: LabFrequency): number | null {
  if (from === 'D') return null;
  return SUBS[to] / SUBS[from];
}

/** Convierte a una frecuencia más baja. Devuelve puntos ordenados y los períodos parciales. */
export function convert(points: Point[], from: LabFrequency, to: LabFrequency, agg: Aggregation): { points: Point[]; partial: Set<string> } {
  if (from === to) return { points: points.slice(), partial: new Set() };
  if (!canConvert(from, to)) return { points: [], partial: new Set() };
  const groups = new Map<string, { vals: number[]; n: number; last: string }>();
  for (const [p, v] of points) {
    const t = targetPeriod(p, from, to);
    const g = groups.get(t) ?? { vals: [], n: 0, last: p };
    g.n++;
    if (p > g.last) g.last = p;
    if (finite(v)) g.vals.push(v);
    groups.set(t, g);
  }
  const need = required(from, to);
  const partial = new Set<string>();
  const out: Point[] = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, g], i, arr) => {
    const complete = need === null ? true : g.vals.length === need && g.n === need;
    if (need === null && i === arr.length - 1) partial.add(t); // último período diario: puede estar en curso
    if (!g.vals.length || !complete) return [t, null];
    const value = agg === 'sum' ? g.vals.reduce((a, b) => a + b, 0) : agg === 'last' ? g.vals.at(-1)! : g.vals.reduce((a, b) => a + b, 0) / g.vals.length;
    return [t, value];
  });
  // Para «último dato» la referencia es el último valor por fecha, no por orden de inserción.
  if (agg === 'last') {
    const lastByT = new Map<string, [string, number]>();
    for (const [p, v] of points) if (finite(v)) {
      const t = targetPeriod(p, from, to);
      const cur = lastByT.get(t);
      if (!cur || p > cur[0]) lastByT.set(t, [p, v]);
    }
    for (const pt of out) if (pt[1] !== null) pt[1] = lastByT.get(pt[0])?.[1] ?? null;
  }
  return { points: out, partial };
}

/** Precios constantes del último período con deflactor: x × D_base / D_t. */
export function deflate(points: Point[], deflator: Point[]): { points: Point[]; base: string | null } {
  const d = new Map(deflator.filter(([, v]) => finite(v)) as [string, number][]);
  const base = [...d.keys()].sort().at(-1) ?? null;
  const db = base ? d.get(base)! : null;
  return { base, points: points.map(([p, v]) => [p, finite(v) && db !== null && d.has(p) && d.get(p) !== 0 ? (v * db) / d.get(p)! : null]) };
}

const CORE_T: Partial<Record<LabTransform, TransformId>> = { level: 'level', pct_prev: 'pct_prev', pct_yoy: 'pct_yoy', diff_prev: 'diff_prev_pp', diff_yoy: 'diff_yoy_abs', ytd_sum: 'ytd_sum' };

function shiftDateYear(d: string, years: number): string {
  const y = Number(d.slice(0, 4)) + years;
  const m = d.slice(5, 7), day = Number(d.slice(8, 10));
  const max = new Date(Date.UTC(y, Number(m), 0)).getUTCDate();
  return `${y}-${m}-${String(Math.min(day, max)).padStart(2, '0')}`;
}

/** Transformaciones. M/Q/S/A con core; diaria: vs observación previa o misma fecha del año anterior. */
export function transform(points: Point[], freq: LabFrequency, t: LabTransform, visibleFrom?: string): Point[] {
  if (t === 'ln') return points.map(([p, v]) => [p, finite(v) && v > 0 ? Math.log(v) : null]);
  if (t === 'rebase_100') {
    const base = points.find(([p, v]) => finite(v) && (!visibleFrom || p >= visibleFrom))?.[1] ?? null;
    return points.map(([p, v]) => [p, finite(v) && finite(base) && base !== 0 ? (v / base) * 100 : null]);
  }
  if (freq === 'D') {
    const m = new Map(points);
    return points.map(([p, v], i) => {
      const prev = t === 'pct_prev' || t === 'diff_prev' ? points[i - 1]?.[1] : t === 'pct_yoy' || t === 'diff_yoy' ? m.get(shiftDateYear(p, -1)) : undefined;
      if (t === 'level') return [p, v];
      if (t === 'sum_12m' || t === 'ytd_sum') return [p, null];
      if (!finite(v) || !finite(prev)) return [p, null];
      return [p, t.startsWith('pct') ? (prev !== 0 ? (v / prev - 1) * 100 : null) : v - prev];
    });
  }
  const obs: Observation[] = points.map(([period, value]) => ({ period, value }));
  if (t === 'sum_12m') {
    if (freq === 'A') return points.map(([p]) => [p, null]);
    return applyTransform(obs, freq, 'sum_12m').map((x) => [x.period, x.value]);
  }
  if (t === 'ytd_sum' && freq === 'A') return points.slice();
  return applyTransform(obs, freq, CORE_T[t]!).map((x) => [x.period, x.value]);
}

export function combine(a: Point[], b: Point[], op: RatioOp): Point[] {
  const mb = new Map(b);
  return a.filter(([p]) => mb.has(p)).map(([p, va]) => {
    const vb = mb.get(p);
    if (!finite(va) || !finite(vb)) return [p, null];
    const v = op === 'div' ? (vb !== 0 ? va / vb : null) : op === 'mul' ? va * vb : op === 'sub' ? va - vb : va + vb;
    return [p, v];
  });
}

export function periodLabel(p: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return `${p.slice(8, 10)}/${p.slice(5, 7)}/${p.slice(0, 4)}`;
  if (/^\d{4}-\d{2}$/.test(p)) return `${p.slice(5, 7)}/${p.slice(0, 4)}`;
  if (/^\d{4}-Q\d$/.test(p)) return `T${p.slice(6)} ${p.slice(0, 4)}`;
  if (/^\d{4}-S\d$/.test(p)) return `S${p.slice(6)} ${p.slice(0, 4)}`;
  return p;
}

export interface LabColumn { item: LabItem; label: string; unit: string; points: Point[]; partial: Set<string>; realBase: string | null; problem?: string }
export interface LabModel { frequency: LabFrequency; periods: string[]; columns: LabColumn[]; orgs: string[] }

interface BuildInput {
  items: LabItem[];
  catalog: Map<string, LabSeriesMeta>;
  data: Map<string, LabSeriesData>;
  frequency: LabFrequency;
  deflatorId: string;
  from?: string;
  to?: string;
}

/** Unidad resultante de una transformación sobre una unidad base. */
function unitFor(base: string, item: LabItem): string {
  const scale = SCALES.find((s) => s.value === item.scale)?.label;
  const scaled = item.scale !== 1 && scale && base !== '%' ? `${base} (${scale})` : base;
  switch (item.transform) {
    case 'pct_prev': case 'pct_yoy': return '%';
    case 'rebase_100': return 'Índice base 100';
    case 'ln': return `ln(${base})`;
    case 'diff_prev': case 'diff_yoy': return `Diferencia en ${scaled}`;
    default: return scaled;
  }
}

/** Fecha 'YYYY-MM-DD' de los controles → período de la frecuencia elegida. */
function boundOf(frequency: LabFrequency, bound?: string): string | undefined {
  if (!bound) return undefined;
  return frequency === 'D' ? bound : targetPeriod(bound, 'D', frequency);
}

export function buildLabModel({ items, catalog, data, frequency, deflatorId, from, to }: BuildInput): LabModel {
  const deflMeta = catalog.get(deflatorId);
  const deflData = data.get(deflatorId);
  const deflator = deflMeta && deflData && canConvert(deflMeta.frequency, frequency) ? convert(deflData.points, deflMeta.frequency, frequency, 'mean').points : [];
  const levels = new Map<string, { points: Point[]; partial: Set<string>; unit: string; base: string | null; problem?: string; orgs: string[] }>();
  const fromP = boundOf(frequency, from);
  const toP = boundOf(frequency, to);

  const levelOf = (item: LabSeriesItem) => {
    const meta = catalog.get(item.id), d = data.get(item.id);
    if (!meta || !d) return { points: [] as Point[], partial: new Set<string>(), unit: meta?.unit ?? '', base: null, problem: 'Cargando datos…', orgs: meta ? [meta.org] : [] };
    if (!canConvert(meta.frequency, frequency)) return { points: [], partial: new Set<string>(), unit: meta.unit, base: null, problem: `No se puede pasar de frecuencia ${meta.frequency} a ${frequency}: elegí una frecuencia igual o más baja.`, orgs: [meta.org] };
    let { points, partial } = convert(d.points, meta.frequency, frequency, item.aggregation);
    let unit = meta.unit, base: string | null = null, problem: string | undefined;
    if (item.real) {
      if (!deflator.length) problem = 'Sin IPC compatible con esta frecuencia: se muestran valores nominales.';
      else ({ points, base } = deflate(points, deflator));
      if (base) unit = `${unit.replace(/corrientes/i, '').trim()} a precios de ${periodLabel(base)}`;
    }
    return { points, partial, unit, base, problem, orgs: [meta.org, ...(item.real && base ? ['INDEC'] : [])] };
  };

  for (const item of items) if (item.kind === 'series') levels.set(item.key, levelOf(item));
  const columns: LabColumn[] = [];
  const orgs: string[] = [];
  for (const item of items) {
    let lv = levels.get(item.key);
    if (item.kind === 'ratio') {
      const a = levels.get(item.a), b = levels.get(item.b);
      if (!a || !b) { columns.push({ item, label: item.label, unit: '', points: [], partial: new Set(), realBase: null, problem: 'Elegí las dos series del cálculo.' }); continue; }
      const sym = { div: '÷', mul: '×', sub: '−', add: '+' }[item.op];
      lv = { points: combine(a.points, b.points, item.op), partial: new Set([...a.partial, ...b.partial]), unit: item.op === 'div' ? (item.scale === 100 ? '%' : `Cociente (${a.unit} ${sym} ${b.unit})`) : item.op === 'mul' ? `${a.unit} × ${b.unit}` : a.unit, base: a.base ?? b.base, orgs: [...a.orgs, ...b.orgs] };
    }
    if (!lv) continue;
    orgs.push(...lv.orgs);
    const scaled: Point[] = lv.points.map(([p, v]) => [p, finite(v) ? v * item.scale : null]);
    const visibleFrom = fromP;
    const tr = transform(scaled, frequency, item.transform, visibleFrom);
    const pts = tr.filter(([p]) => (!fromP || p >= fromP) && (!toP || p <= toP));
    columns.push({ item, label: item.label, unit: unitFor(lv.unit, item), points: pts, partial: lv.partial, realBase: lv.base, problem: lv.problem });
  }
  const periods = [...new Set(columns.flatMap((c) => c.points.map(([p]) => p)))].sort();
  return { frequency, periods, columns, orgs: [...new Set(orgs)] };
}

export function labCsv(model: LabModel, bom: string, sep: string, num: (v: number | null | undefined) => string): string {
  const maps = model.columns.map((c) => new Map(c.points));
  const q = (s: string) => (/[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = ['periodo', ...model.columns.map((c) => `${c.label} [${c.unit}${c.item.transform !== 'level' ? ` · ${LAB_TRANSFORM_LABELS[c.item.transform]}` : ''}]`)];
  const lines = model.periods.map((p) => [p, ...maps.map((m) => num(m.get(p)))].map(q).join(sep));
  return bom + [head.map(q).join(sep), ...lines].join('\r\n') + '\r\n';
}

export { parsePeriod, shiftPeriod };
