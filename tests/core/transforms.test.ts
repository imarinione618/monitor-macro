import { describe, expect, it } from 'vitest';
import { applyTransform, allowedTransforms, differenceSeries, realIndex } from '@/core/transforms';
import { buildWideTable } from '@/core/views';
import {
  formatPeriodShort,
  fromEphQuarter,
  fromEphSemester,
  fromYYYYMM,
  periodRange,
  periodStartDate,
  periodToSheetsSerial,
  shiftPeriod,
} from '@/core/periods';
import type { Observation, SeriesDef } from '@/core/types';
import { SERIES, validateRegistry } from '@/core/registry';

const obs = (pairs: [string, number | null][]): Observation[] => pairs.map(([period, value]) => ({ period, value }));
const val = (pts: { period: string; value: number | null }[], p: string) => pts.find((x) => x.period === p)?.value;

describe('períodos', () => {
  it('parsea formatos reales de la API', () => {
    expect(fromYYYYMM('202409')).toBe('2024-09');
    expect(fromEphQuarter('20162T')).toBe('2016-Q2');
    expect(fromEphSemester('20261S')).toBe('2026-S1');
    expect(() => fromYYYYMM('202413')).toThrow();
    expect(() => fromEphQuarter('2016T2')).toThrow();
  });
  it('desplaza por calendario cruzando años', () => {
    expect(shiftPeriod('2024-01', -1)).toBe('2023-12');
    expect(shiftPeriod('2024-03', -12)).toBe('2023-03');
    expect(shiftPeriod('2024-Q1', -1)).toBe('2023-Q4');
    expect(shiftPeriod('2024-Q2', -4)).toBe('2023-Q2');
    expect(shiftPeriod('2024-S1', -1)).toBe('2023-S2');
  });
  it('fecha representativa y serial de Sheets', () => {
    expect(periodStartDate('2024-03')).toBe('2024-03-01');
    expect(periodStartDate('2024-Q3')).toBe('2024-07-01');
    expect(periodStartDate('2024-S2')).toBe('2024-07-01');
    expect(periodToSheetsSerial('2024-01')).toBe(45292); // 2024-01-01 en Sheets/Excel
    expect(formatPeriodShort('2024-03')).toBe('mar-24');
    expect(formatPeriodShort('2024-Q2')).toBe('II-24');
  });
  it('rango inclusivo', () => {
    expect(periodRange('2023-11', '2024-02')).toEqual(['2023-11', '2023-12', '2024-01', '2024-02']);
  });
});

describe('transformaciones', () => {
  it('var. mensual busca el período por fecha: un mes faltante da null, no una variación de dos meses', () => {
    const s = obs([['2024-01', 100], ['2024-03', 110]]); // falta febrero (fila ausente)
    const r = applyTransform(s, 'M', 'pct_prev');
    expect(val(r, '2024-03')).toBeNull();
  });
  it('var. mensual e interanual', () => {
    const s = obs([['2023-03', 50], ['2024-02', 100], ['2024-03', 104]]);
    expect(val(applyTransform(s, 'M', 'pct_prev'), '2024-03')).toBeCloseTo(4, 12);
    expect(val(applyTransform(s, 'M', 'pct_yoy'), '2024-03')).toBeCloseTo(108, 12);
  });
  it('interanual trimestral compara 4 trimestres atrás', () => {
    const s = obs([['2023-Q2', 200], ['2024-Q1', 1], ['2024-Q2', 210]]);
    expect(val(applyTransform(s, 'Q', 'pct_yoy'), '2024-Q2')).toBeCloseTo(5, 12);
  });
  it('faltante explícito (null) no es cero', () => {
    const s = obs([['2024-01', 100], ['2024-02', null], ['2024-03', 110]]);
    const r = applyTransform(s, 'M', 'pct_prev');
    expect(val(r, '2024-02')).toBeNull();
    expect(val(r, '2024-03')).toBeNull();
  });
  it('acumulado del año de un índice es contra diciembre anterior', () => {
    const s = obs([['2023-12', 200], ['2024-01', 210], ['2024-02', 220]]);
    expect(val(applyTransform(s, 'M', 'pct_ytd'), '2024-02')).toBeCloseTo(10, 12);
    expect(val(applyTransform(s, 'M', 'pct_ytd'), '2023-12')).toBeNull();
  });
  it('acumulado de flujos y comparación con igual tramo del año previo', () => {
    const s = obs([
      ['2023-01', 10], ['2023-02', 20], ['2023-03', 999],
      ['2024-01', 15], ['2024-02', 30],
    ]);
    expect(val(applyTransform(s, 'M', 'ytd_sum'), '2024-02')).toBe(45);
    expect(val(applyTransform(s, 'M', 'ytd_sum_pct_yoy'), '2024-02')).toBeCloseTo(50, 12);
  });
  it('var. acumulada i.a. de actividad = promedio ene..t vs igual tramo del año anterior', () => {
    const s = obs([['2023-01', 100], ['2023-02', 110], ['2023-12', 500], ['2024-01', 105], ['2024-02', 115.5]]);
    // (105+115,5)/(100+110) − 1 = 5 %; diciembre (500) no interviene
    expect(val(applyTransform(s, 'M', 'ytd_avg_pct_yoy'), '2024-02')).toBeCloseTo(5, 12);
  });
  it('acumulado de flujos con un mes faltante es null (no suma parcial)', () => {
    const s = obs([['2024-01', 15], ['2024-03', 30]]);
    expect(val(applyTransform(s, 'M', 'ytd_sum'), '2024-03')).toBeNull();
  });
  it('suma 12 meses', () => {
    const s = obs(periodRange('2023-01', '2024-12').map((p, i) => [p, i + 1] as [string, number]));
    expect(val(applyTransform(s, 'M', 'sum_12m'), '2023-12')).toBe(78); // 1..12
    expect(val(applyTransform(s, 'M', 'sum_12m'), '2023-11')).toBeNull();
    expect(val(applyTransform(s, 'M', 'sum_12m_pct_yoy'), '2024-12')).toBeCloseTo(((13 + 24) * 6 / 78 - 1) * 100, 10);
  });
  it('tasas: diferencia en puntos porcentuales', () => {
    const s = obs([['2023-Q2', 6.2], ['2024-Q1', 7.7], ['2024-Q2', 7.6]]);
    expect(val(applyTransform(s, 'Q', 'diff_yoy_pp'), '2024-Q2')).toBeCloseTo(1.4, 12);
    expect(val(applyTransform(s, 'Q', 'diff_prev_pp'), '2024-Q2')).toBeCloseTo(-0.1, 12);
  });
  it('rebase a 100 con período y con rango base', () => {
    const s = obs([['2024-01', 50], ['2024-02', 150], ['2024-03', 200]]);
    expect(val(applyTransform(s, 'M', 'rebase_100', { basePeriod: '2024-01' }), '2024-03')).toBe(400);
    expect(val(applyTransform(s, 'M', 'rebase_100', { basePeriod: '2024-01', basePeriodEnd: '2024-02' }), '2024-03')).toBe(200);
  });
  it('salario real: nominal / IPC, reescalado a la base común', () => {
    const w = obs([['2016-12', 120], ['2017-12', 150]]);
    const p = obs([['2016-12', 100], ['2017-12', 125]]);
    const r = realIndex(w, p, '2016-12');
    expect(r.find((x) => x.period === '2016-12')!.value).toBeCloseTo(100, 12);
    expect(r.find((x) => x.period === '2017-12')!.value).toBeCloseTo(100, 12);
  });
  it('saldo = expo − impo solo donde ambas existen', () => {
    const d = differenceSeries(obs([['2024-01', 10], ['2024-02', 5]]), obs([['2024-01', 12]]));
    expect(d).toEqual([{ period: '2024-01', value: -2 }]);
  });
});

describe('transformaciones permitidas', () => {
  const def = (p: Partial<SeriesDef>) => ({ measure: 'index', frequency: 'M', seasonalAdjustment: 'original', topic: 'precios', ...p }) as SeriesDef;
  it('actividad original no admite var. m/m; desestacionalizada sí', () => {
    expect(allowedTransforms(def({ topic: 'actividad' }))).not.toContain('pct_prev');
    expect(allowedTransforms(def({ topic: 'actividad', seasonalAdjustment: 'desestacionalizada' }))).toContain('pct_prev');
  });
  it('tasas no admiten porcentajes y saldos no admiten % ni base 100', () => {
    expect(allowedTransforms(def({ measure: 'rate', frequency: 'Q' }))).toEqual(['level', 'diff_yoy_pp']);
    expect(allowedTransforms(def({ measure: 'rate', frequency: 'Q', seasonalAdjustment: 'desestacionalizada' }))).toContain('diff_prev_pp');
    const b = allowedTransforms(def({ measure: 'balance', topic: 'comex' }));
    expect(b).not.toContain('pct_yoy');
    expect(b).not.toContain('rebase_100');
  });
  it('acumulada: actividad usa igual tramo del año anterior; precios, contra diciembre', () => {
    const act = allowedTransforms(def({ topic: 'actividad' }));
    expect(act).toContain('ytd_avg_pct_yoy');
    expect(act).not.toContain('pct_ytd');
    const pre = allowedTransforms(def({ topic: 'precios' }));
    expect(pre).toContain('pct_ytd');
    expect(pre).not.toContain('ytd_avg_pct_yoy');
    expect(allowedTransforms(def({ measure: 'price_level' }))).toContain('pct_ytd');
  });
  it('acumulado contra diciembre solo en frecuencia mensual', () => {
    expect(allowedTransforms(def({ frequency: 'Q' }))).not.toContain('pct_ytd');
  });
});

describe('tablas anchas', () => {
  it('no mezcla frecuencias y alinea por calendario con huecos explícitos', () => {
    const defs: Record<string, SeriesDef> = {
      a: { id: 'a', measure: 'index', frequency: 'M', seasonalAdjustment: 'original', topic: 'precios', shortName: 'A', unit: 'u' } as SeriesDef,
      b: { id: 'b', measure: 'index', frequency: 'M', seasonalAdjustment: 'original', topic: 'precios', shortName: 'B', unit: 'u' } as SeriesDef,
      q: { id: 'q', measure: 'rate', frequency: 'Q', seasonalAdjustment: 'original', topic: 'laboral', shortName: 'Q', unit: '%' } as SeriesDef,
    };
    const data = (id: string) =>
      ({
        a: { id: 'a', observations: obs([['2024-01', 1], ['2024-03', 3]]), meta: {} },
        b: { id: 'b', observations: obs([['2024-02', 2]]), meta: {} },
        q: { id: 'q', observations: obs([['2024-Q1', 7]]), meta: {} },
      })[id] as never;
    const t = buildWideTable([{ seriesId: 'a', transform: 'level' }, { seriesId: 'b', transform: 'level' }], (id) => defs[id]!, data);
    expect(t.periods).toEqual(['2024-01', '2024-02', '2024-03']);
    expect(t.values).toEqual([[1, null, 3], [null, 2, null]]);
    expect(() => buildWideTable([{ seriesId: 'a', transform: 'level' }, { seriesId: 'q', transform: 'level' }], (id) => defs[id]!, data)).toThrow();
  });
});

describe('registro', () => {
  it('IDs únicos, dependencias y variantes existentes', () => {
    expect(validateRegistry()).toEqual([]);
  });
  it('cada serie con headline usa transformaciones válidas', () => {
    for (const s of SERIES.filter((x) => x.headline)) {
      expect(allowedTransforms(s), s.id).toContain(s.headline!.transform);
      if (s.headline!.compare) expect(allowedTransforms(s), s.id).toContain(s.headline!.compare);
    }
  });
});
