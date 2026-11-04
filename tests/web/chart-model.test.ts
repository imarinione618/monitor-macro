import { describe, expect, it } from 'vitest';
import { getSeries } from '@/core/registry';
import { allowedTransforms } from '@/core/transforms';
import {
  availableAdjustments,
  buildChartModel,
  buildSnapshotModel,
  compatibility,
  pickTransform,
  resolveVariant,
  transformChoices,
  validTransformIds,
} from '@/web/lib/chartModel';
import { assignColorSlots } from '@/web/lib/palette';
import { fakeSeries } from './helpers';

const emaeOrig = getSeries('actividad.emae.total.orig');
const emaeSa = getSeries('actividad.emae.total.sa');
const desoc = getSeries('laboral.eph.desocupacion');
const ipc = getSeries('precios.ipc.ng.nacional');
const ipim = getSeries('precios.sipm.ipim.ng');
const expo = getSeries('comex.expo.total');
const saldo = getSeries('comex.saldo');

describe('selector de transformaciones', () => {
  it('nunca habilita una transformación fuera de allowedTransforms', () => {
    for (const id of ['actividad.emae.total.orig', 'laboral.eph.desocupacion', 'comex.saldo', 'precios.canastas.cba_adulto', 'laboral.pobreza.pobreza_personas']) {
      const def = getSeries(id);
      const enabled = validTransformIds([def]);
      for (const t of enabled) expect(allowedTransforms(def)).toContain(t);
    }
  });

  it('EMAE original: var. mensual deshabilitada con explicación; desestacionalizada: habilitada', () => {
    const c = transformChoices([emaeOrig]).find((x) => x.id === 'pct_prev');
    expect(c?.enabled).toBe(false);
    expect(c?.reason).toMatch(/desestacionalizada/);
    expect(validTransformIds([emaeSa])).toContain('pct_prev');
  });

  it('tasas: solo nivel y diferencias en p.p. (sin %)', () => {
    const ids = validTransformIds([desoc]);
    // EPH sin desestacionalizar: sin diferencia vs trimestre anterior (mezcla estacionalidad)
    expect(ids).toEqual(['level', 'diff_yoy_pp']);
    expect(transformChoices([desoc]).map((c) => c.id)).not.toContain('pct_yoy');
    const prev = transformChoices([desoc]).find((c) => c.id === 'diff_prev_pp');
    expect(prev?.enabled).toBe(false);
    expect(prev?.reason).toMatch(/mismo período del año anterior/);
  });

  it('trimestral: no ofrece var. acumulada vs diciembre', () => {
    expect(validTransformIds([desoc])).not.toContain('pct_ytd');
  });

  it('series con bases distintas: nivel deshabilitado (unidades distintas), % y base 100 habilitados', () => {
    const ch = transformChoices([ipc, ipim]);
    expect(ch.find((c) => c.id === 'level')?.enabled).toBe(false);
    expect(ch.find((c) => c.id === 'pct_yoy')?.enabled).toBe(true);
    expect(ch.find((c) => c.id === 'rebase_100')?.enabled).toBe(true);
  });

  it('flujo + saldo: solo transformaciones válidas para ambos', () => {
    expect(validTransformIds([expo, saldo])).toEqual(['level', 'ytd_sum', 'sum_12m']);
  });

  it('pickTransform cae a una alternativa válida', () => {
    expect(pickTransform([emaeOrig], 'pct_prev', ['pct_yoy'])).toBe('pct_yoy');
    expect(pickTransform([emaeSa], 'pct_prev', ['pct_yoy'])).toBe('pct_prev');
  });
});

describe('compatibilidad de series', () => {
  it('no mezcla frecuencias', () => {
    expect(compatibility(desoc, [ipc], 'level').ok).toBe(false);
  });
  it('exige la misma unidad resultante', () => {
    expect(compatibility(ipim, [ipc], 'level').ok).toBe(false);
    expect(compatibility(ipim, [ipc], 'pct_yoy').ok).toBe(true);
  });
  it('rechaza transformaciones inválidas para la candidata', () => {
    expect(compatibility(emaeOrig, [emaeSa], 'pct_prev').ok).toBe(false);
  });
});

describe('variantes de ajuste estacional', () => {
  it('resuelve la variante pedida', () => {
    expect(resolveVariant(emaeOrig, 'desestacionalizada')).toBe('actividad.emae.total.sa');
    expect(resolveVariant(ipc, 'desestacionalizada')).toBe(ipc.id);
  });
  it('lista solo ajustes con datos', () => {
    const pool = {
      'actividad.emae.total.orig': fakeSeries('actividad.emae.total.orig', '2020-01', '2020-12', () => 100),
      'actividad.emae.total.sa': fakeSeries('actividad.emae.total.sa', '2020-01', '2020-12', () => 100),
    };
    expect(availableAdjustments([emaeOrig], pool)).toEqual(['original', 'desestacionalizada']);
    expect(availableAdjustments([ipc], pool)).toEqual([]);
  });
});

describe('modelo del gráfico', () => {
  const s = fakeSeries('precios.ipc.ng.nacional', '2016-12', '2026-08', (i) => 100 * 1.02 ** i);

  it('rango 12 meses = últimos 12 períodos con dato', () => {
    const m = buildChartModel({ series: [s], transform: 'pct_prev', range: '12m' })!;
    expect(m.periods.length).toBe(12);
    expect(m.periods[11]).toBe('2026-08');
    expect(m.periods[0]).toBe('2025-09');
    expect(m.columns[0]!.values[0]).toBeCloseTo(2, 10);
    expect(m.unit).toBe('%');
  });

  it('"Todo" arranca en el primer período con valor transformado (i.a. pierde 12 meses)', () => {
    const m = buildChartModel({ series: [s], transform: 'pct_yoy', range: 'all' })!;
    expect(m.periods[0]).toBe('2017-12');
  });

  it('base 100: por defecto el primer período visible; elegible', () => {
    const m = buildChartModel({ series: [s], transform: 'rebase_100', range: '24m' })!;
    expect(m.basePeriod).toBe(m.periods[0]);
    expect(m.columns[0]!.values[0]).toBeCloseTo(100, 10);
    const m2 = buildChartModel({ series: [s], transform: 'rebase_100', range: '24m', basePeriod: '2020-01' })!;
    expect(m2.basePeriod).toBe('2020-01');
    expect(m2.unit).toMatch(/base = 100/);
  });

  it('faltante se mantiene null', () => {
    const g = fakeSeries('precios.ipc.ng.nacional', '2024-01', '2024-12', (i) => (i === 5 ? null : 100 + i));
    const m = buildChartModel({ series: [g], transform: 'level', range: 'all' })!;
    expect(m.columns[0]!.values[5]).toBeNull();
  });

  it('corte transversal: referencia primero y resto ordenado', () => {
    const a = fakeSeries('actividad.emae_sector.agro.orig', '2024-01', '2025-06', (i) => 100 + i);
    const b = fakeSeries('actividad.emae_sector.pesca.orig', '2024-01', '2025-06', (i) => 100 + 3 * i);
    const t = fakeSeries('actividad.emae.total.orig', '2024-01', '2025-06', (i) => 100 + 2 * i);
    const snap = buildSnapshotModel([a, b, t], 'pct_yoy', null, t.def.id)!;
    expect(snap.period).toBe('2025-06');
    expect(snap.rows[0]!.id).toBe(t.def.id);
    expect(snap.rows[1]!.id).toBe(b.def.id);
  });
});

describe('colores estables', () => {
  it('una serie conserva su color al quitar otra', () => {
    const s1 = assignColorSlots(['a', 'b', 'c'], {});
    const s2 = assignColorSlots(['a', 'c'], s1);
    expect(s2.c).toBe(s1.c);
    const s3 = assignColorSlots(['a', 'c', 'd'], s2);
    expect(s3.d).toBe(s1.b);
  });
});
