import { describe, expect, it } from 'vitest';
import { buildLabModel, canConvert, combine, convert, deflate, transform, type LabItem } from '../../src/web/lib/lab';
import { buildAggregatesGdp, gdpAnnualRolling } from '../../src/web/lib/aggregatesGdp';
import { atConstantPrices } from '../../src/core/transforms';
import type { LabSeriesData, LabSeriesMeta } from '../../src/web/lib/labTypes';
import type { MonetarySeries } from '../../src/monetary/types';

describe('Laboratorio — conversión, deflactado, transformaciones y ratios', () => {
  it('solo convierte hacia frecuencias más bajas', () => {
    expect(canConvert('D', 'M')).toBe(true);
    expect(canConvert('M', 'D')).toBe(false);
    expect(canConvert('Q', 'S')).toBe(false);
    expect(canConvert('M', 'A')).toBe(true);
  });
  it('mensual → trimestral exige el trimestre completo; suma, promedio y último', () => {
    const pts: [string, number | null][] = [['2026-01', 1], ['2026-02', 2], ['2026-03', 3], ['2026-04', 4], ['2026-05', null], ['2026-06', 6]];
    expect(convert(pts, 'M', 'Q', 'sum').points).toEqual([['2026-Q1', 6], ['2026-Q2', null]]);
    expect(convert(pts, 'M', 'Q', 'mean').points[0]).toEqual(['2026-Q1', 2]);
    expect(convert(pts, 'M', 'Q', 'last').points[0]).toEqual(['2026-Q1', 3]);
  });
  it('diaria → mensual promedia lo publicado y marca el último mes como posiblemente parcial', () => {
    const r = convert([['2026-10-30', 10], ['2026-10-31', 20], ['2026-11-03', 30]], 'D', 'M', 'mean');
    expect(r.points).toEqual([['2026-10', 15], ['2026-11', 30]]);
    expect([...r.partial]).toEqual(['2026-11']);
  });
  it('deflacta con el último período del deflactor como base y deja null sin deflactor', () => {
    const r = deflate([['2026-01', 100], ['2026-02', 110], ['2026-03', 120]], [['2026-01', 100], ['2026-02', 110]]);
    expect(r.base).toBe('2026-02');
    expect(r.points).toEqual([['2026-01', 110], ['2026-02', 110], ['2026-03', null]]);
    expect(atConstantPrices([{ period: '2026-01', value: 100 }], [{ period: '2026-01', value: 50 }, { period: '2026-02', value: 100 }], '2026-02')).toEqual([{ period: '2026-01', value: 200 }]);
  });
  it('transformaciones por calendario y ratios sobre períodos comunes', () => {
    const m: [string, number | null][] = [['2025-01', 100], ['2026-01', 150]];
    expect(transform(m, 'M', 'pct_yoy').at(-1)).toEqual(['2026-01', 50]);
    expect(transform([['2025-03-02', 10], ['2026-03-02', 12]], 'D', 'pct_yoy').at(-1)![1]).toBeCloseTo(20);
    expect(transform([['2026-01', Math.E]], 'M', 'ln')[0]![1]).toBeCloseTo(1);
    expect(combine([['a', 10], ['b', 4], ['c', 1]], [['a', 2], ['b', 0]], 'div')).toEqual([['a', 5], ['b', null]]);
  });
  it('modelo: ratio entre series convertidas a la frecuencia común, con escala', () => {
    const meta = (id: string, frequency: 'D' | 'Q', nature: 'stock' | 'index'): LabSeriesMeta => ({ id, name: id, shortName: id, group: 'g', unit: 'Millones', frequency, nature, org: id === 'pib' ? 'INDEC' : 'BCRA', start: null, end: null });
    const catalog = new Map([['m2', meta('m2', 'D', 'stock')], ['pib', meta('pib', 'Q', 'index')]]);
    const data = new Map<string, LabSeriesData>([['m2', { id: 'm2', points: [['2026-01-05', 10], ['2026-02-05', 20], ['2026-03-05', 30]] }], ['pib', { id: 'pib', points: [['2026-Q1', 400]] }]]);
    const base = { axis: 'left', type: 'line', transform: 'level', real: false } as const;
    const items: LabItem[] = [
      { ...base, kind: 'series', id: 'm2', key: 'a', label: 'M2', scale: 1, aggregation: 'mean' },
      { ...base, kind: 'series', id: 'pib', key: 'b', label: 'PIB', scale: 1, aggregation: 'mean' },
      { ...base, kind: 'ratio', key: 'r', label: 'M2/PIB', a: 'a', b: 'b', op: 'div', scale: 100, aggregation: 'mean' },
    ];
    const model = buildLabModel({ items, catalog, data, frequency: 'Q', deflatorId: 'ipc' });
    expect(model.columns.find((c) => c.item.key === 'r')!.points).toEqual([['2026-Q1', 5]]);
    expect(model.orgs).toEqual(['BCRA', 'INDEC']);
  });
});

describe('agregados como % del PIB', () => {
  const daily = (id: string, rows: [string, number][]): MonetarySeries => ({ def: { id } as MonetarySeries['def'], observations: rows.map(([date, value]) => ({ date, value })), retrievedAt: '', stale: false });
  it('PIB anual móvil = promedio de 4 trimestres anualizados (no suma)', () => {
    const r = gdpAnnualRolling([{ period: '2025-Q3', value: 100 }, { period: '2025-Q4', value: 200 }, { period: '2026-Q1', value: 300 }, { period: '2026-Q2', value: 400 }]);
    expect(r.get('2026-Q2')).toBe(250);
    expect(r.has('2026-Q1')).toBe(false);
  });
  it('oficial con PIB publicado; punteado (estimado) después del último PIB', () => {
    const gdp = [{ period: '2025-Q3', value: 1000 }, { period: '2025-Q4', value: 1000 }, { period: '2026-Q1', value: 1000 }, { period: '2026-Q2', value: 1000 }];
    const m2 = daily('monetario.m2.total', [['2026-04-01', 90], ['2026-06-30', 110], ['2026-07-01', 120], ['2026-09-30', 120], ['2026-10-01', 130]]);
    const model = buildAggregatesGdp([m2], gdp, '2026-11-06');
    const pts = model.columns[0]!.points;
    expect(pts.find((p) => p.period === '2026-Q2')).toMatchObject({ value: 10, estimated: false });
    expect(pts.find((p) => p.period === '2026-Q3')).toMatchObject({ value: 12, estimated: true, partial: false });
    expect(pts.find((p) => p.period === '2026-Q4')).toMatchObject({ value: 13, estimated: true, partial: true });
  });
});
