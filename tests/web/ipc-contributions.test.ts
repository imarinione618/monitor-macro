import { describe, expect, it } from 'vitest';
import { ipcContribution } from '@/core/transforms';
import { buildChartModel } from '@/web/lib/chartModel';
import { buildSubtitle, exportTimeSeriesOption } from '@/web/lib/chartOptions';
import { renderSvgString } from '@/web/lib/exportRender';
import { buildIpcContributions, contributionId, IPC_CONTRIBUTIONS, IPC_GENERAL } from '@/web/lib/ipcContributions';
import { buildSourceLine, collectNotes } from '@/web/lib/meta';
import { fakeSeries } from './helpers';

const general = fakeSeries(IPC_GENERAL, '2025-01', '2025-03', (i) => [200, 210, 220][i]!);
const categories = IPC_CONTRIBUTIONS.map(({ key }, i) => fakeSeries(`precios.ipc.cat.${key}.nacional`, '2025-01', '2025-03', (t) => 200 + t * [10, -4, 20][i]!));

describe('contribuciones mensuales del IPC', () => {
  it('usa el nivel general anterior y conserva el peso exacto', () => {
    const result = ipcContribution(categories[0]!.observations, general.observations, 0.679236);
    expect(result[0]!.value).toBeNull();
    expect(result[1]!.value).toBeCloseTo(3.39618, 10);
    expect(result[2]!.value).toBeCloseTo(100 * 0.679236 * 10 / 210, 10);
  });

  it('conserva aportes negativos y cero sin convertirlos en faltantes', () => {
    expect(ipcContribution(categories[1]!.observations, general.observations, 0.113209)[1]!.value).toBeCloseTo(-0.226418, 10);
    expect(ipcContribution(general.observations.map((o) => ({ ...o, value: 100 })), general.observations, 0.5)[1]!.value).toBe(0);
  });

  it('no compara filas no consecutivas ni reemplaza faltantes por cero', () => {
    const sparse = categories[0]!.observations.filter((o) => o.period !== '2025-02');
    expect(ipcContribution(sparse, general.observations, 0.5).every((o) => o.value === null)).toBe(true);
    const missingGeneral = general.observations.map((o) => ({ ...o, value: null }));
    expect(ipcContribution(categories[0]!.observations, missingGeneral, 0.5).every((o) => o.value === null)).toBe(true);
    const zeroGeneral = general.observations.map((o) => ({ ...o, value: 0 }));
    expect(ipcContribution(categories[0]!.observations, zeroGeneral, 0.5).every((o) => o.value === null)).toBe(true);
  });

  it('la suma recupera la inflación cuando los índices y pesos son coherentes', () => {
    const a = [{ period: '2025-01', value: 100 }, { period: '2025-02', value: 110 }];
    const b = [{ period: '2025-01', value: 200 }, { period: '2025-02', value: 190 }];
    const g = [{ period: '2025-01', value: 140 }, { period: '2025-02', value: 142 }];
    const total = ipcContribution(a, g, 0.6)[1]!.value! + ipcContribution(b, g, 0.4)[1]!.value!;
    expect(total).toBeCloseTo((142 / 140 - 1) * 100, 10);
  });

  it('propaga datos anteriores, errores y origen sintético de ambos insumos', () => {
    const result = buildIpcContributions([{ ...general, stale: true, error: 'falló actualización', retrievedAt: '2026-11-01T00:00:00Z' }, ...categories]);
    expect(result).toHaveLength(3);
    expect(result.every((s) => s.stale && s.synthetic && s.error === 'falló actualización' && s.retrievedAt === '2026-11-01T00:00:00Z')).toBe(true);
    expect(result[0]!.firstPeriod).toBe('2025-02');
    expect(collectNotes(result).join(' ')).toContain('1,000492');
    expect(buildSourceLine(result, 'level')).toBe('Fuente: one618 en base a INDEC.');
  });

  it('exporta barras apiladas con los tres colores, unidad p.p. y sin notas metodológicas', () => {
    const series = buildIpcContributions([general, ...categories]);
    const model = buildChartModel({ series, transform: 'level', range: '24m' })!;
    const option = exportTimeSeriesOption({
      model,
      kind: 'stacked',
      colorSlots: Object.fromEntries(IPC_CONTRIBUTIONS.map(({ key, colorSlot }) => [contributionId(key), colorSlot])),
      meta: { title: 'Incidencia en la inflación general por categoría', subtitle: buildSubtitle(model), source: buildSourceLine(series, 'level'), notes: collectNotes(series) },
    });
    const bars = option.series as { type: string; stack: string; color: string; data: (number | null)[] }[];
    expect(bars.every((s) => s.type === 'bar' && s.stack === 'total')).toBe(true);
    expect(bars.map((s) => s.color)).toEqual(['#1A4CC8', '#969696', '#E32D91']);
    expect(bars[1]!.data.some((v) => v !== null && v < 0)).toBe(true);
    const svg = renderSvgString(option);
    expect(svg).toContain('p.p.');
    expect(svg).not.toContain('Estimación propia');
    expect(svg).toContain('Núcleo');
  });
});
