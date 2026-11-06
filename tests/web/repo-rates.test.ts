import { describe, expect, it } from 'vitest';
import { MONETARY_BY_BCRA_ID } from '@/monetary/catalog';
import { CAUCION_DEF } from '@/monetary/caucionDef';
import type { MonetaryDef, MonetarySeries } from '@/monetary/types';
import { renderSvgString } from '@/web/lib/exportRender';
import { DARK_THEME } from '@/web/lib/palette';
import { buildRepoRatesModel, buildRepoRatesOption, defaultRepoRatesFrom, repoRatesCsv, repoRatesRow } from '@/web/lib/repoRatesChart';

const make = (def: MonetaryDef, rows: [string, number | null][]): MonetarySeries => ({ def, observations: rows.map(([date, value]) => ({ date, value })), retrievedAt: '2026-11-06T15:00:00Z', stale: false });
const repo = make(MONETARY_BY_BCRA_ID.get(198)!, [['2025-12-30', 2_000_000], ['2026-11-03', 1_451_451.3319], ['2026-11-04', 1_359_825.8495]]);
const tamar = make(MONETARY_BY_BCRA_ID.get(44)!, [['2026-11-03', 24.1], ['2026-11-04', null]]);
const caucion = make(CAUCION_DEF, [['2026-11-04', 21.8], ['2026-11-05', 22.2]]);
const all = [tamar, repo, caucion];

describe('gráfico Repo BCRA + caución + TAMAR', () => {
  it('convierte Repo a billones sin tocar las tasas ni completar fechas', () => {
    const model = buildRepoRatesModel(all, { from: '2026-01-01' });
    expect(model.dates).toEqual(['2026-11-03', '2026-11-04', '2026-11-05']);
    expect(model.columns.map(c => c.key)).toEqual(['repo', 'caucion', 'tamar']);
    expect(repoRatesRow(model, '2026-11-04')).toEqual({ repo: 1.3598258495, caucion: 21.8, tamar: null });
    expect(repoRatesRow(model, '2026-11-05')).toEqual({ repo: undefined, caucion: 22.2, tamar: undefined });
    expect(repo.observations[1]!.value).toBe(1_451_451.3319);
  });
  it('arranca por defecto en el año del último dato de Repo y respeta asOf', () => {
    expect(defaultRepoRatesFrom(all)).toBe('2026-01-01');
    expect(buildRepoRatesModel(all, { asOf: '2026-11-04' }).dates.at(-1)).toBe('2026-11-04');
  });
  it('el CSV deja vacíos los faltantes y cita ambas fuentes', () => {
    const model = buildRepoRatesModel(all, { from: '2026-11-04' });
    const lines = repoRatesCsv(model).trim().split('\r\n');
    expect(lines[0]).toContain('[billones de ARS]');
    expect(lines[1]).toBe('2026-11-04;1,3598258495;21,8;');
    expect(lines[2]).toBe('2026-11-05;;22,2;');
    expect(model.source).toContain('BCRA');
    expect(model.source).toContain('A3 Mercados');
  });
  it('usa dos ejes: área Repo a la izquierda y tasas a la derecha; exporta en blanco', () => {
    const model = buildRepoRatesModel(all, { from: '2026-01-01' });
    const option = buildRepoRatesOption({ model, title: 'Repo BCRA, tasa de caución y TAMAR', theme: DARK_THEME, exportMode: true }) as { series: { yAxisIndex: number; areaStyle?: unknown }[]; backgroundColor: string };
    expect(option.series.map(s => s.yAxisIndex)).toEqual([0, 1, 1]);
    expect(option.series[0]!.areaStyle).toBeTruthy();
    expect(option.series[1]!.areaStyle).toBeUndefined();
    expect(option.backgroundColor).toBe('#ffffff');
    const svg = renderSvgString(option);
    expect(svg).toContain('Repo BCRA, tasa de caución y TAMAR');
    expect(svg).toContain('Billones de ARS');
    expect(svg).toContain('% TNA');
    expect(svg).toContain('A3 Mercados');
  });
});
