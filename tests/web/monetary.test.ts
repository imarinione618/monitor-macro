import { describe, expect, it } from 'vitest';
import { MONETARY_BY_BCRA_ID } from '@/monetary/catalog';
import type { MonetarySeries } from '@/monetary/types';
import { buildMonetaryChartModel, monetaryChartCsv, monetaryDate, type MonetaryOptions } from '@/web/lib/monetaryChartModel';
import { buildMonetaryChartOption } from '@/web/lib/monetaryChartOptions';
import { renderSvgString } from '@/web/lib/exportRender';
import { DARK_THEME, LIGHT_THEME } from '@/web/lib/palette';

function fake(id: number, observations: MonetarySeries['observations']): MonetarySeries {
  return { def: MONETARY_BY_BCRA_ID.get(id)!, observations, retrievedAt: '2026-11-04T14:00:00Z', stale: false };
}
const daily: MonetaryOptions = { frequency: 'D', monthlyMode: 'mean', valueMode: 'nominal', transform: 'level', asOf: '2026-11-04' };
const badlar = fake(7, [{ date: '2026-10-30', value: 30 }, { date: '2026-11-02', value: 32 }]);
const tamar = fake(44, [{ date: '2026-10-29', value: 32.125 }, { date: '2026-10-30', value: 32.5 }]);

describe('monetary chart/table/download shared model', () => {
  it('aligns daily dates without filling independently missing rates or filtering by another rate', () => {
    const model = buildMonetaryChartModel([tamar, badlar], daily, [], []);
    expect(model.periods).toEqual(['2026-10-29', '2026-10-30', '2026-11-02']);
    expect(model.columns[0]!.values).toEqual([32.125, 32.5, null]);
    expect(model.columns[1]!.values).toEqual([null, 30, 32]);
    expect(monetaryDate('2026-11-02')).toBe('02/11/2026');
    expect(model.subtitle).toContain('% TNA');
  });

  it('exports exactly the visible values without rounding, with actual dates and missing values left blank', () => {
    const model = buildMonetaryChartModel([tamar, badlar], { ...daily, from: '2026-10-30' }, [], []);
    const csv = monetaryChartCsv(model);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('2026-10-30;32,5;2026-10-30;no;1;30;2026-10-30;no;1');
    expect(lines[2]).toBe('2026-11-02;;;;;32;2026-11-02;no;1');
    expect(csv).not.toContain('2026-10-29');
  });

  it('keeps a monthly partial and effective date visible in the export', () => {
    const model = buildMonetaryChartModel([badlar], { ...daily, frequency: 'M' }, [], []);
    expect(model.columns[0]!.points[1]).toMatchObject({ period: '2026-11', partial: true, effectiveDate: '2026-11-02' });
    expect(monetaryChartCsv(model)).toContain('2026-11;32;2026-11-02;sí;1');
    expect(model.subtitle).toContain('Promedio mensual');
    expect(model.subtitle).toContain('Mes parcial; corte hasta 02/11/2026');
  });

  it('rate changes use basis points and exports agree with chart values', () => {
    const model = buildMonetaryChartModel([badlar], { ...daily, transform: 'change_bp' }, [], []);
    expect(model.columns[0]!.values).toEqual([null, 200]);
    expect(model.unit).toBe('Puntos básicos');
    expect(monetaryChartCsv(model)).toContain(';200;2026-11-02;no;1');
  });

  it('compositions average only simultaneous dates, preserving each component in CSV', () => {
    const one = fake(94, [{ date: '2026-09-01', value: 10 }, { date: '2026-09-02', value: 20 }]);
    const two = fake(95, [{ date: '2026-09-02', value: 50 }, { date: '2026-09-03', value: 80 }]);
    const model = buildMonetaryChartModel([one, two], { ...daily, frequency: 'M' }, [], [], true);
    expect(model.columns.map(c => c.values)).toEqual([[20], [50]]);
    expect(model.columns.map(c => c.points[0]!.coverageCount)).toEqual([1, 1]);
    expect(monetaryChartCsv(model)).toContain('2026-09;20;2026-09-02;sí;1;50;2026-09-02;sí;1');
  });
});

describe('monetary presentation export', () => {
  it('renders daily data to white SVG with title, original rate convention, dates, and source', () => {
    const model = buildMonetaryChartModel([tamar, badlar], daily, [], []);
    const option = buildMonetaryChartOption({ model, title: 'TAMAR y BADLAR', theme: DARK_THEME, exportMode: true });
    expect(option.backgroundColor).toBe('#ffffff');
    expect(option.animation).toBe(false);
    expect(option.tooltip).toBeUndefined();
    const svg = renderSvgString(option);
    expect(svg).toContain('width="1600"');
    expect(svg).toContain('height="900"');
    expect(svg).toContain('TAMAR y BADLAR');
    expect(svg).toContain('% TNA');
    expect(svg).toContain('Fuente: one618 en base a BCRA');
    expect(svg).toContain('02/11/2026');
    expect(svg.match(/\s[a-zA-Z:-]+="[^"]*"(?![\s>/])/g) ?? []).toEqual([]);
  });

  it('disables legend hiding so the graph, table, and CSV retain the same series', () => {
    const model = buildMonetaryChartModel([tamar, badlar], daily, [], []);
    const option = buildMonetaryChartOption({ model, title: 'Tasas', theme: LIGHT_THEME });
    expect(option.legend).toMatchObject({ selectedMode: false });
    expect(option.tooltip).toBeDefined();
  });
});
