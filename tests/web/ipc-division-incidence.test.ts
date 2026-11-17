import { describe, expect, it } from 'vitest';
import { readSeriesData } from '@/core/store';
import { renderSvgString } from '@/web/lib/exportRender';
import { buildWaterfallModel, exportWaterfallOption, waterfallCsv } from '@/web/lib/ipcWaterfall';
import { buildIpcDivisionContributions, DIVISION_TOTAL_ID, divisionContributionId, IPC_DIVISION_WEIGHTS, IPC_GENERAL } from '@/web/lib/ipcContributions';
import { buildSourceLine } from '@/web/lib/meta';
import type { ClientSeries } from '@/web/lib/types';
import { fakeSeries } from './helpers';

const divId = (key: string) => `precios.ipc.div.${key}.nacional`;

describe('incidencias del IPC por división', () => {
  it('ponderaciones nacionales: 12 divisiones que suman 1 salvo redondeo de la fuente', () => {
    expect(IPC_DIVISION_WEIGHTS).toHaveLength(12);
    const sum = IPC_DIVISION_WEIGHTS.reduce((a, d) => a + d.weight, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-5);
  });

  it('cada división = 100 × peso × Δsubíndice / nivel general anterior; la referencia es la var. % m/m', () => {
    // Índices coherentes: nivel general = Σ peso × subíndice (Laspeyres de base fija).
    const subs = IPC_DIVISION_WEIGHTS.map(({ key }, i) => fakeSeries(divId(key), '2026-01', '2026-03', (t) => 100 + t * (i - 4)));
    const ng = fakeSeries(IPC_GENERAL, '2026-01', '2026-03', (t) => IPC_DIVISION_WEIGHTS.reduce((a, d, i) => a + d.weight * (100 + t * (i - 4)), 0));
    const out = buildIpcDivisionContributions([ng, ...subs]);
    expect(out.map((s) => s.def.id)).toEqual([DIVISION_TOTAL_ID, ...IPC_DIVISION_WEIGHTS.map(({ key }) => divisionContributionId(key))]);
    const at = (s: ClientSeries, p: string) => s.observations.find((o) => o.period === p)!.value!;
    const total = at(out[0]!, '2026-02');
    expect(total).toBeCloseTo((ng.observations[1]!.value! / ng.observations[0]!.value! - 1) * 100, 10);
    expect(out.slice(1).reduce((a, s) => a + at(s, '2026-02'), 0)).toBeCloseTo(total, 10);
    // Negativas se conservan (división con caída de precios).
    expect(at(out[1]!, '2026-02')).toBeLessThan(0);
    expect(out[0]!.observations[0]!.value).toBeNull();
    expect(out.every((s) => s.def.unit === 'p.p.' && s.def.measure === 'incidence')).toBe(true);
    expect(buildSourceLine(out, 'level')).toBe('Fuente: one618 en base a INDEC.');
  });

  it('cascada: divisiones de mayor a menor, cada una parte del acumulado previo y cierra en la inflación del mes', () => {
    // Una división con caída de precios (i = 0 → −1 por mes) para probar incidencias negativas.
    const subs = IPC_DIVISION_WEIGHTS.map(({ key }, i) => fakeSeries(divId(key), '2026-01', '2026-02', (t) => 100 + t * (i - 1)));
    const ng = fakeSeries(IPC_GENERAL, '2026-01', '2026-02', (t) => IPC_DIVISION_WEIGHTS.reduce((a, d, i) => a + d.weight * (100 + t * (i - 1)), 0));
    const model = buildWaterfallModel(buildIpcDivisionContributions([ng, ...subs]), DIVISION_TOTAL_ID, null)!;
    expect(model.period).toBe('2026-02');
    expect(model.steps).toHaveLength(13);
    const last = model.steps.at(-1)!;
    expect(last.isTotal && last.start === 0 && last.id === DIVISION_TOTAL_ID).toBe(true);
    const parts = model.steps.slice(0, -1);
    expect(parts.map((s) => s.value!)).toEqual(parts.map((s) => s.value!).sort((a, b) => b - a));
    let cum = 0;
    for (const s of parts) {
      expect(s.start).toBeCloseTo(cum, 12);
      cum += s.value!;
    }
    expect(parts.at(-1)!.value!).toBeLessThan(0);
    expect(model.residual!).toBeCloseTo(0, 10);
    expect(last.value!).toBeCloseTo(cum, 10);
    const csv = waterfallCsv(model);
    expect(csv).toContain('Inflación del mes;2026-02;');
    const svg = renderSvgString(exportWaterfallOption({ model, exportMeta: { title: 'Incidencia', subtitle: 'p.p.', source: 'Fuente: one618 en base a INDEC.' } }));
    expect(svg).toContain('Inflación del mes');
  });

  it('sin nivel general no se calcula nada', () => {
    expect(buildIpcDivisionContributions([fakeSeries(divId('alimentos'), '2026-01', '2026-02', () => 100)])).toEqual([]);
  });
});

const real = readSeriesData(IPC_GENERAL);
describe.skipIf(!real)('incidencias del IPC por división (store real)', () => {
  it('la suma de las 12 incidencias reproduce la variación mensual del nivel general (≤ 0,1 p.p.)', () => {
    const map = (id: string) => new Map((readSeriesData(id)?.observations ?? []).map((o) => [o.period, o.value]));
    const g = map(IPC_GENERAL);
    const subs = IPC_DIVISION_WEIGHTS.map(({ key, weight }) => ({ m: map(divId(key)), weight }));
    const periods = [...g.keys()].sort();
    let n = 0;
    for (let i = 1; i < periods.length; i++) {
      const p = periods[i]!, q = periods[i - 1]!;
      const gp = g.get(p), gq = g.get(q);
      if (gp == null || gq == null || subs.some((s) => s.m.get(p) == null || s.m.get(q) == null)) continue;
      const sum = subs.reduce((a, s) => a + (100 * s.weight * (s.m.get(p)! - s.m.get(q)!)) / gq, 0);
      expect(Math.abs(sum - (gp / gq - 1) * 100), p).toBeLessThan(0.1);
      n++;
    }
    expect(n).toBeGreaterThan(100);
  });
});
