import { describe, expect, it } from 'vitest';
import { buildChartModel } from '@/web/lib/chartModel';
import { filterRange } from '@/web/components/AggregatesGdpPanel';
import type { AggregateGdpModel } from '@/web/lib/aggregatesGdp';
import { fakeSeries } from './helpers';

const ipc = fakeSeries('precios.ipc.ng.nacional', '2016-12', '2026-08', (i) => 100 * 1.02 ** i);

describe('rango personalizado (Desde / Hasta)', () => {
  it('recorta exactamente al tramo elegido y conserva toda la historia como opciones', () => {
    const m = buildChartModel({ series: [ipc], transform: 'pct_yoy', range: 'custom', custom: { from: '2019-03', to: '2020-02' } })!;
    expect(m.periods[0]).toBe('2019-03');
    expect(m.periods.at(-1)).toBe('2020-02');
    expect(m.periods).toHaveLength(12);
    // Opciones: desde el primer i.a. calculable (dic-2017) hasta el último dato.
    expect(m.availablePeriods[0]).toBe('2017-12');
    expect(m.availablePeriods.at(-1)).toBe('2026-08');
  });

  it('los valores son los mismos que con «Todo» (solo cambia la ventana)', () => {
    const all = buildChartModel({ series: [ipc], transform: 'pct_yoy', range: 'all' })!;
    const cut = buildChartModel({ series: [ipc], transform: 'pct_yoy', range: 'custom', custom: { from: '2022-01', to: '2022-06' } })!;
    const i = all.periods.indexOf('2022-01');
    expect(cut.columns[0]!.values).toEqual(all.columns[0]!.values.slice(i, i + 6));
  });

  it('fechas fuera de la historia se ajustan a los datos disponibles; sin límite = todo', () => {
    const m = buildChartModel({ series: [ipc], transform: 'level', range: 'custom', custom: { from: '1990-01', to: '2030-12' } })!;
    expect(m.periods[0]).toBe('2016-12');
    expect(m.periods.at(-1)).toBe('2026-08');
    const open = buildChartModel({ series: [ipc], transform: 'level', range: 'custom' })!;
    expect(open.periods).toEqual(m.periods);
  });

  it('un tramo sin datos deja el gráfico vacío pero mantiene las opciones', () => {
    const m = buildChartModel({ series: [ipc], transform: 'level', range: 'custom', custom: { from: '2030-01', to: '2030-06' } })!;
    expect(m.empty).toBe(true);
    expect(m.availablePeriods.length).toBeGreaterThan(100);
  });

  it('agregados/PIB: filtra trimestres entre Desde y Hasta inclusive', () => {
    const periods = ['2023-Q1', '2023-Q2', '2023-Q3', '2023-Q4', '2024-Q1'];
    const model = { periods, columns: [{ id: 'm2', label: 'M2', points: periods.map((p) => ({ period: p, value: 1, estimated: false, partial: false, days: 90 })) }], methodology: '' } as unknown as AggregateGdpModel;
    const v = filterRange(model, 'custom', { from: '2023-Q2', to: '2023-Q4' });
    expect(v.periods).toEqual(['2023-Q2', '2023-Q3', '2023-Q4']);
    expect(v.columns[0]!.points.map((p) => p.period)).toEqual(['2023-Q2', '2023-Q3', '2023-Q4']);
  });
});
