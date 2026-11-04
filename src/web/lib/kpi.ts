/**
 * Tarjetas KPI y mini gráficos (sparklines): cálculo puro.
 * Cada indicador usa SU PROPIO último período (no una fecha común).
 */
import { formatPeriodLong, formatPeriodShort, shiftPeriod, PERIODS_PER_YEAR } from '@/core/periods';
import { allowedTransforms, applyTransform, TRANSFORMS } from '@/core/transforms';
import type { Observation, Period, SeriesDef, TransformId } from '@/core/types';
import { transformLabel } from './chartModel';

export interface Kpi {
  period: Period | null;
  periodLabel: string;
  value: number | null;
  unit: string;
  label: string;
  /** true si el último período publicado no tiene valor para la transformación. */
  lagged: boolean;
  lastObservedPeriod: Period | null;
  compare: { label: string; value: number | null; unit: string; signed: boolean } | null;
  spark: { period: Period; value: number | null }[];
}

function compareLabel(t: TransformId, def: SeriesDef): string {
  const per = def.frequency === 'M' ? 'mes' : def.frequency === 'Q' ? 'trimestre' : def.frequency === 'S' ? 'semestre' : 'año';
  switch (t) {
    case 'pct_yoy':
      return 'Var. % interanual';
    case 'diff_yoy_pp':
      return `vs. igual ${per} del año anterior (p.p.)`;
    case 'diff_yoy_abs':
      return `vs. igual ${per} del año anterior`;
    case 'pct_prev':
      return `Var. % vs ${per} anterior`;
    default:
      return transformLabel(t, def.frequency);
  }
}

/**
 * Calcula la tarjeta de una serie: valor de `transform` en el último período con dato
 * y comparación pertinente (`compare`) en ese mismo período. Sin `compare`, se muestra
 * el valor de la misma transformación en el período anterior.
 */
export function computeKpi(def: SeriesDef, obs: Observation[], transform: TransformId, compare?: TransformId, sparkPeriods = 24): Kpi {
  const allowed = allowedTransforms(def);
  const t = allowed.includes(transform) ? transform : 'level';
  const pts = obs.length ? applyTransform(obs, def.frequency, t) : [];
  const unit = TRANSFORMS[t].unit(def.unit);
  let idx = -1;
  for (let i = pts.length - 1; i >= 0; i--)
    if (pts[i]!.value !== null) {
      idx = i;
      break;
    }
  const lastObserved = [...obs].reverse().find((o) => o.value !== null)?.period ?? null;
  const period = idx >= 0 ? pts[idx]!.period : null;
  const value = idx >= 0 ? pts[idx]!.value : null;

  let cmp: Kpi['compare'] = null;
  if (period) {
    if (compare && allowed.includes(compare)) {
      const cpts = applyTransform(obs, def.frequency, compare);
      const cv = cpts.find((p) => p.period === period)?.value ?? null;
      cmp = { label: compareLabel(compare, def), value: cv, unit: TRANSFORMS[compare].unit(def.unit), signed: compare !== 'level' };
    } else {
      const prev = shiftPeriod(period, -1);
      const pv = pts.find((p) => p.period === prev)?.value ?? null;
      const per = def.frequency === 'M' ? 'Mes anterior' : def.frequency === 'Q' ? 'Trimestre anterior' : 'Período anterior';
      cmp = { label: `${per} (${formatPeriodShort(prev)})`, value: pv, unit, signed: t !== 'level' };
    }
  }

  const n = Math.min(sparkPeriods, PERIODS_PER_YEAR[def.frequency] * 6);
  const spark = idx >= 0 ? pts.slice(Math.max(0, idx - n + 1), idx + 1) : [];

  return {
    period,
    periodLabel: period ? formatPeriodLong(period) : 'Sin datos',
    value,
    unit,
    label: transformLabel(t, def.frequency),
    lagged: !!period && !!lastObserved && period !== lastObserved,
    lastObservedPeriod: lastObserved,
    compare: cmp,
    spark,
  };
}

/** Path SVG (polilínea) para un sparkline; cortes en faltantes. Devuelve también la línea del cero si cae dentro. */
export function sparklinePath(values: (number | null)[], width: number, height: number, pad = 2): { d: string; zeroY: number | null; lastX: number | null; lastY: number | null } {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length < 2) return { d: '', zeroY: null, lastX: null, lastY: null };
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const n = values.length;
  const x = (i: number) => pad + (i * (width - 2 * pad)) / Math.max(1, n - 1);
  const y = (v: number) => pad + (1 - (v - min) / (max - min)) * (height - 2 * pad);
  let d = '';
  let pen = false;
  let lastX: number | null = null;
  let lastY: number | null = null;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    const X = x(i).toFixed(1);
    const Y = y(v).toFixed(1);
    d += `${pen ? 'L' : 'M'}${X} ${Y} `;
    pen = true;
    lastX = Number(X);
    lastY = Number(Y);
  });
  const zeroY = min < 0 && max > 0 ? Number(y(0).toFixed(1)) : null;
  return { d: d.trim(), zeroY, lastX, lastY };
}

export interface FlowSummaryCell {
  value: number | null;
  /** Comparación interanual: % para flujos, diferencia absoluta para saldos. */
  cmp: number | null;
}

export interface FlowSummary {
  period: Period | null;
  month: FlowSummaryCell;
  ytd: FlowSummaryCell;
  sum12: FlowSummaryCell;
  cmpUnit: string;
}

/**
 * Resumen de un flujo/saldo mensual en su último período con dato: mes, acumulado del año
 * y suma de 12 meses, con su comparación interanual (por calendario).
 */
export function flowSummary(def: SeriesDef, obs: Observation[]): FlowSummary {
  const isBalance = def.measure === 'balance';
  const at = (t: TransformId, p: Period | null) => (p ? (applyTransform(obs, def.frequency, t).find((x) => x.period === p)?.value ?? null) : null);
  const level = applyTransform(obs, def.frequency, 'level');
  const last = [...level].reverse().find((x) => x.value !== null)?.period ?? null;
  const prevYear = last ? shiftPeriod(last, -PERIODS_PER_YEAR[def.frequency]) : null;
  const diff = (t: TransformId) => {
    const a = at(t, last);
    const b = at(t, prevYear);
    return a === null || b === null ? null : a - b;
  };
  if (isBalance) {
    return {
      period: last,
      month: { value: at('level', last), cmp: diff('level') },
      ytd: { value: at('ytd_sum', last), cmp: diff('ytd_sum') },
      sum12: { value: at('sum_12m', last), cmp: diff('sum_12m') },
      cmpUnit: def.unit,
    };
  }
  return {
    period: last,
    month: { value: at('level', last), cmp: at('pct_yoy', last) },
    ytd: { value: at('ytd_sum', last), cmp: at('ytd_sum_pct_yoy', last) },
    sum12: { value: at('sum_12m', last), cmp: at('sum_12m_pct_yoy', last) },
    cmpUnit: '%',
  };
}
