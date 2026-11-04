/**
 * Transformaciones económicas — ÚNICA implementación usada por Sheets y dashboard.
 *
 * Reglas:
 *  - Los períodos de comparación se buscan por calendario (shiftPeriod), nunca
 *    por posición. Si falta el período de comparación, el resultado es null.
 *  - No se interpola ni se arrastran valores.
 *  - Sobre tasas y saldos se calculan diferencias (p.p. / absolutas), no %.
 *  - No se redondea: el redondeo es responsabilidad de la presentación.
 */
import { PERIODS_PER_YEAR, parsePeriod, shiftPeriod, makePeriod } from './periods';
import type {
  Frequency,
  Measure,
  Observation,
  Period,
  SeasonalAdjustment,
  SeriesDef,
  TransformId,
  TransformInfo,
  TransformedPoint,
} from './types';

export const TRANSFORMS: Record<TransformId, TransformInfo> = {
  level: { id: 'level', label: 'Nivel', unit: (u) => u, description: 'Valor de la serie: el publicado por la fuente o, en series derivadas (p.ej. salario real, saldo), el cálculo propio documentado en sus notas.' },
  pct_prev: {
    id: 'pct_prev',
    label: 'Var. % vs período anterior',
    unit: () => '%',
    description: '(x_t / x_{t-1} − 1) × 100. Mensual o trimestral según la frecuencia.',
  },
  pct_yoy: {
    id: 'pct_yoy',
    label: 'Var. % interanual',
    unit: () => '%',
    description: '(x_t / x_{t-1 año} − 1) × 100, comparando el mismo período del año anterior.',
  },
  pct_ytd: {
    id: 'pct_ytd',
    label: 'Var. % acumulada en el año',
    unit: () => '%',
    description: 'Índice del período vs diciembre del año anterior: (x_t / x_dic(t-1) − 1) × 100.',
  },
  ytd_avg_pct_yoy: {
    id: 'ytd_avg_pct_yoy',
    label: 'Var. % acumulada i.a.',
    unit: () => '%',
    description:
      'Promedio (o suma) de enero a t del año vs igual tramo del año anterior: (Σ x_ene..t / Σ x_ene..t,año−1 − 1) × 100. Criterio del INDEC para EMAE e IPI.',
  },
  diff_prev_pp: {
    id: 'diff_prev_pp',
    label: 'Dif. vs período anterior (p.p.)',
    unit: () => 'p.p.',
    description: 'x_t − x_{t-1}, en puntos porcentuales.',
  },
  diff_yoy_pp: {
    id: 'diff_yoy_pp',
    label: 'Dif. interanual (p.p.)',
    unit: () => 'p.p.',
    description: 'x_t − x_{t-1 año}, en puntos porcentuales.',
  },
  diff_yoy_abs: {
    id: 'diff_yoy_abs',
    label: 'Dif. interanual',
    unit: (u) => u,
    description: 'x_t − x_{t-1 año}, en la unidad de la serie.',
  },
  ytd_sum: {
    id: 'ytd_sum',
    label: 'Acumulado del año',
    unit: (u) => u,
    description: 'Suma de enero (o 1.er período) al período t. Null si falta algún período del tramo.',
  },
  ytd_sum_pct_yoy: {
    id: 'ytd_sum_pct_yoy',
    label: 'Acumulado del año, var. % i.a.',
    unit: () => '%',
    description: 'Acumulado del año vs igual tramo del año anterior.',
  },
  sum_12m: {
    id: 'sum_12m',
    label: 'Suma últimos 12 meses',
    unit: (u) => u,
    description: 'Suma móvil de 12 meses (4 trimestres). Null si falta algún período.',
  },
  sum_12m_pct_yoy: {
    id: 'sum_12m_pct_yoy',
    label: 'Suma 12 meses, var. % i.a.',
    unit: () => '%',
    description: 'Suma móvil de 12 meses vs la de 12 meses antes.',
  },
  rebase_100: {
    id: 'rebase_100',
    label: 'Base 100',
    unit: () => 'Índice (base = 100)',
    description: 'x_t / x_base × 100. Solo para índices y niveles positivos; el período base se informa.',
  },
};

/** Transformaciones válidas por naturaleza de la serie. */
export const ALLOWED_BY_MEASURE: Record<Measure, TransformId[]> = {
  index: ['level', 'pct_prev', 'pct_yoy', 'pct_ytd', 'ytd_avg_pct_yoy', 'rebase_100'],
  rate: ['level', 'diff_prev_pp', 'diff_yoy_pp'],
  flow: ['level', 'pct_yoy', 'ytd_sum', 'ytd_sum_pct_yoy', 'sum_12m', 'sum_12m_pct_yoy', 'rebase_100'],
  balance: ['level', 'diff_yoy_abs', 'ytd_sum', 'sum_12m'],
  price_level: ['level', 'pct_prev', 'pct_yoy', 'pct_ytd', 'rebase_100'],
  published_change: ['level'],
  weight: ['level'],
  incidence: ['level'],
};

/**
 * Transformaciones permitidas para una serie concreta.
 *  - pct_prev en series trimestrales/mensuales de ACTIVIDAD solo con desestacionalizada
 *    (o tendencia-ciclo): una variación t/t o m/m de serie original mezcla estacionalidad.
 *    Para precios (IPC, mayoristas, salarios) la variación mensual de la serie
 *    original es la medida oficial y se permite.
 *  - Acumulado del año de un índice:
 *      precios/salarios -> pct_ytd (vs diciembre anterior, criterio INDEC IPC/salarios);
 *      actividad        -> ytd_avg_pct_yoy (tramo ene..t vs igual tramo del año anterior,
 *                          criterio INDEC EMAE/IPI; comparar contra diciembre mezclaría estacionalidad).
 *  - Tasas sin desestacionalizar sub-anuales (EPH): sin diferencia vs período anterior
 *    (mezcla estacionalidad); se compara contra el mismo período del año anterior.
 *  - ytd/12m solo en frecuencias sub-anuales.
 */
export function allowedTransforms(def: Pick<SeriesDef, 'measure' | 'frequency' | 'seasonalAdjustment' | 'topic'>): TransformId[] {
  let list = [...ALLOWED_BY_MEASURE[def.measure]];
  if (def.frequency === 'A')
    list = list.filter((t) => !['pct_prev', 'diff_prev_pp', 'pct_ytd', 'ytd_avg_pct_yoy', 'ytd_sum', 'ytd_sum_pct_yoy', 'sum_12m', 'sum_12m_pct_yoy'].includes(t));
  if (def.frequency !== 'M') list = list.filter((t) => t !== 'pct_ytd');
  if (def.topic === 'actividad') list = list.filter((t) => t !== 'pct_ytd');
  else list = list.filter((t) => t !== 'ytd_avg_pct_yoy');
  if (def.topic === 'actividad' && def.seasonalAdjustment === 'original') list = list.filter((t) => t !== 'pct_prev');
  if (def.measure === 'rate' && def.seasonalAdjustment === 'original' && def.frequency !== 'A') list = list.filter((t) => t !== 'diff_prev_pp');
  return list;
}

export function isTransformAllowed(def: Parameters<typeof allowedTransforms>[0], t: TransformId): boolean {
  return allowedTransforms(def).includes(t);
}

// ------------------------------------------------------------------ helpers

export type ValueMap = Map<Period, number | null>;

export function toMap(obs: Observation[]): ValueMap {
  const m: ValueMap = new Map();
  for (const o of obs) m.set(o.period, o.value);
  return m;
}

function get(m: ValueMap, p: Period): number | null {
  const v = m.get(p);
  return v === undefined || v === null || !Number.isFinite(v) ? null : v;
}

function pct(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return (a / b - 1) * 100;
}

function lagYear(f: Frequency): number {
  return PERIODS_PER_YEAR[f];
}

/** Suma de los períodos [from..to] (inclusive). Null si falta alguno. */
function sumRange(m: ValueMap, from: Period, to: Period, n: number): number | null {
  let acc = 0;
  let p = from;
  for (let i = 0; i < n; i++) {
    const v = get(m, p);
    if (v === null) return null;
    acc += v;
    p = shiftPeriod(p, 1);
  }
  void to;
  return acc;
}

function ytdSum(m: ValueMap, p: Period): number | null {
  const { year, sub, freq } = parsePeriod(p);
  return sumRange(m, makePeriod(year, 1, freq), p, sub);
}

// ------------------------------------------------------------------ API

export interface TransformOptions {
  /** Para rebase_100: período base (o primer período de un rango base). */
  basePeriod?: Period;
  /** Para rebase_100: último período del rango base (promedio del rango = 100). */
  basePeriodEnd?: Period;
}

/**
 * Aplica una transformación a las observaciones de UNA serie (frecuencia única).
 * Devuelve un punto por cada observación de entrada (mismos períodos).
 */
export function applyTransform(
  obs: Observation[],
  frequency: Frequency,
  t: TransformId,
  opts: TransformOptions = {},
): TransformedPoint[] {
  const m = toMap(obs);
  const L = lagYear(frequency);
  const periods = obs.map((o) => o.period);

  const out = (fn: (p: Period) => number | null): TransformedPoint[] => periods.map((p) => ({ period: p, value: fn(p) }));

  switch (t) {
    case 'level':
      return out((p) => get(m, p));
    case 'pct_prev':
      return out((p) => pct(get(m, p), get(m, shiftPeriod(p, -1))));
    case 'pct_yoy':
      return out((p) => pct(get(m, p), get(m, shiftPeriod(p, -L))));
    case 'pct_ytd':
      if (frequency !== 'M') throw new Error('pct_ytd requiere frecuencia mensual');
      return out((p) => {
        const { year } = parsePeriod(p);
        return pct(get(m, p), get(m, makePeriod(year - 1, 12, 'M')));
      });
    case 'diff_prev_pp':
      return out((p) => {
        const a = get(m, p), b = get(m, shiftPeriod(p, -1));
        return a === null || b === null ? null : a - b;
      });
    case 'diff_yoy_pp':
    case 'diff_yoy_abs':
      return out((p) => {
        const a = get(m, p), b = get(m, shiftPeriod(p, -L));
        return a === null || b === null ? null : a - b;
      });
    case 'ytd_avg_pct_yoy':
      // Mismo cálculo que ytd_sum_pct_yoy: el cociente de sumas equivale al de promedios.
      return out((p) => pct(ytdSum(m, p), ytdSum(m, shiftPeriod(p, -L))));
    case 'ytd_sum':
      return out((p) => ytdSum(m, p));
    case 'ytd_sum_pct_yoy':
      return out((p) => pct(ytdSum(m, p), ytdSum(m, shiftPeriod(p, -L))));
    case 'sum_12m':
      return out((p) => sumRange(m, shiftPeriod(p, -(L - 1)), p, L));
    case 'sum_12m_pct_yoy':
      return out((p) =>
        pct(sumRange(m, shiftPeriod(p, -(L - 1)), p, L), sumRange(m, shiftPeriod(p, -(2 * L - 1)), shiftPeriod(p, -L), L)),
      );
    case 'rebase_100': {
      const base = rebaseDenominator(m, opts);
      return out((p) => {
        const v = get(m, p);
        return v === null || base === null ? null : (v / base) * 100;
      });
    }
  }
}

/** Promedio del rango base (o valor del período base). Null si falta algún período del rango. */
export function rebaseDenominator(m: ValueMap, opts: TransformOptions): number | null {
  if (!opts.basePeriod) throw new Error('rebase_100 requiere basePeriod');
  const end = opts.basePeriodEnd ?? opts.basePeriod;
  let acc = 0, n = 0;
  for (let p = opts.basePeriod; ; p = shiftPeriod(p, 1)) {
    const v = get(m, p);
    if (v === null || v <= 0) return null;
    acc += v;
    n++;
    if (p === end) break;
    if (n > 1000) throw new Error('Rango base inválido');
  }
  return acc / n;
}

/**
 * Índice real = (índice nominal / deflactor), reescalado para que basePeriod = 100.
 * Ambas series deben ser mensuales y estar alineadas por período (mismo mes).
 */
export function realIndex(nominal: Observation[], deflator: Observation[], basePeriod: Period): Observation[] {
  const n = toMap(nominal), d = toMap(deflator);
  const nb = get(n, basePeriod), db = get(d, basePeriod);
  const out: Observation[] = [];
  for (const o of nominal) {
    const nv = get(n, o.period), dv = get(d, o.period);
    if (!d.has(o.period)) continue; // fuera de cobertura del deflactor: no se emite
    out.push({
      period: o.period,
      value: nv === null || dv === null || nb === null || db === null || dv === 0 ? null : ((nv / nb) / (dv / db)) * 100,
    });
  }
  return out;
}

/** Aporte mensual estimado, en p.p. Pesos fijos sin normalizar; comparación por calendario. */
export function ipcContribution(category: Observation[], general: Observation[], weight: number): Observation[] {
  if (!Number.isFinite(weight) || weight < 0) throw new Error('Ponderación del IPC inválida');
  const c = toMap(category), g = toMap(general);
  return category.map((o) => {
    const previous = shiftPeriod(o.period, -1);
    const current = get(c, o.period), prior = get(c, previous), denominator = get(g, previous);
    const value = current === null || prior === null || denominator === null || denominator <= 0
      ? null : 100 * weight * (current - prior) / denominator;
    return { period: o.period, value: value !== null && Number.isFinite(value) ? value : null };
  });
}

/** a − b por período (p.ej. saldo = expo − impo). Solo períodos presentes en ambas. */
export function differenceSeries(a: Observation[], b: Observation[]): Observation[] {
  const bm = toMap(b);
  return a
    .filter((o) => bm.has(o.period))
    .map((o) => {
      const av = o.value, bv = get(bm, o.period);
      return { period: o.period, value: av === null || bv === null ? null : av - bv };
    });
}

/** Etiqueta del ajuste estacional para UI y Sheets. */
export const SA_LABELS: Record<SeasonalAdjustment, string> = {
  original: 'Serie original',
  desestacionalizada: 'Desestacionalizada',
  'tendencia-ciclo': 'Tendencia-ciclo',
  no_aplica: '—',
};
