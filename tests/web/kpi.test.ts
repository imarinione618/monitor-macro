import { describe, expect, it } from 'vitest';
import { computeKpi, flowSummary, sparklinePath } from '@/web/lib/kpi';
import { fakeSeries } from './helpers';

describe('tarjetas KPI', () => {
  it('usa el último período propio de la serie y compara en p.p. para tasas', () => {
    const s = fakeSeries('laboral.eph.desocupacion', '2023-Q1', '2026-Q2', (i) => 8 - i * 0.1);
    const k = computeKpi(s.def, s.observations, 'level', 'diff_yoy_pp');
    expect(k.period).toBe('2026-Q2');
    expect(k.periodLabel).toBe('2.º trimestre 2026');
    expect(k.unit).toBe('%');
    expect(k.compare?.unit).toBe('p.p.');
    expect(k.compare?.value).toBeCloseTo(-0.4, 10);
  });

  it('índice: var. mensual + interanual en el mismo período', () => {
    const s = fakeSeries('precios.ipc.ng.nacional', '2024-01', '2025-08', (i) => 100 * 1.02 ** i);
    const k = computeKpi(s.def, s.observations, 'pct_prev', 'pct_yoy');
    expect(k.period).toBe('2025-08');
    expect(k.value).toBeCloseTo(2, 8);
    expect(k.compare?.value).toBeCloseTo((1.02 ** 12 - 1) * 100, 8);
    expect(k.spark.length).toBeGreaterThan(5);
  });

  it('sin compare: período anterior; con faltante final se informa rezago', () => {
    const s = fakeSeries('actividad.emae.total.sa', '2024-01', '2025-08', (i) => (i === 19 ? null : 100 + i));
    const k = computeKpi(s.def, s.observations, 'pct_prev');
    expect(k.period).toBe('2025-07');
    expect(k.compare?.label).toMatch(/Mes anterior/);
    expect(k.lagged).toBe(false); // el último observado con dato también es jul-25
  });

  it('transformación inválida para la serie → nivel', () => {
    const s = fakeSeries('actividad.emae.total.orig', '2024-01', '2025-08', () => 100);
    expect(computeKpi(s.def, s.observations, 'pct_prev').unit).toMatch(/Índice/);
  });

  it('resumen de comercio: saldo con diferencias absolutas, flujos con %', () => {
    const e = fakeSeries('comex.expo.total', '2024-01', '2025-12', (i) => (i < 12 ? 100 : 110));
    const fe = flowSummary(e.def, e.observations);
    expect(fe.ytd.value).toBe(1320);
    expect(fe.ytd.cmp).toBeCloseTo(10, 10);
    expect(fe.sum12.cmp).toBeCloseTo(10, 10);
    const sd = fakeSeries('comex.saldo', '2024-01', '2025-12', (i) => (i < 12 ? -5 : 5));
    const fs = flowSummary(sd.def, sd.observations);
    expect(fs.month.cmp).toBe(10);
    expect(fs.ytd.cmp).toBe(120);
    expect(fs.cmpUnit).toBe('Millones de USD');
  });

  it('sparkline corta en faltantes', () => {
    const p = sparklinePath([1, 2, null, 3, 4], 100, 20);
    expect(p.d.match(/M/g)?.length).toBe(2);
  });
});
