import { describe, expect, it } from 'vitest';
import { deriveMonetarySeries } from '@/monetary/analytics';
import { readMonetaryStore } from '@/monetary/store';
import type { MonetarySeries } from '@/monetary/types';
import { renderSvgString } from '@/web/lib/exportRender';
import { buildSeasonality, exportSeasonalityOption, M2_PRIVADO_ID, realMonthlyChanges, seasonalityCsv, type MonthlyChange } from '@/web/lib/moneySeasonality';
import { getClientSeries } from '@/web/server/store';

/** Variaciones sintéticas: valor = año − 2000 + mes / 100 (fácil de promediar a mano). */
const synthetic: MonthlyChange[] = [];
for (let year = 2016; year <= 2026; year++)
  for (let month = 1; month <= 12; month++) if (!(year === 2026 && month > 10)) synthetic.push({ period: `${year}-${String(month).padStart(2, '0')}`, year, month, value: year - 2000 + month / 100 });

describe('estacionalidad de la demanda de dinero', () => {
  it('«últimos N años» toma los N valores más recientes de cada mes', () => {
    const m = buildSeasonality(synthetic, { kind: 'last', years: 3 });
    expect(m.rows).toHaveLength(12);
    expect(m.rows[0]!.years).toEqual([2024, 2025, 2026]);
    expect(m.rows[0]!.mean).toBeCloseTo(25 + 0.01, 10);
    // Noviembre todavía no tiene 2026: usa 2023–2025.
    expect(m.rows[10]!.years).toEqual([2023, 2024, 2025]);
    expect(m.rows[10]!.mean).toBeCloseTo(24 + 0.11, 10);
    expect(m.usedFrom).toBe(2023);
    expect(m.usedTo).toBe(2026);
  });

  it('el rango de años es inclusivo y un mes sin datos queda vacío, no en cero', () => {
    const m = buildSeasonality(synthetic, { kind: 'range', from: 2026, to: 2026 });
    expect(m.rows[9]!.mean).toBeCloseTo(26.1, 10);
    expect(m.rows[11]!.mean).toBeNull();
    expect(m.rows[11]!.count).toBe(0);
  });

  it('el año de comparación muestra su propio valor de cada mes', () => {
    const m = buildSeasonality(synthetic, { kind: 'last', years: 10 }, 2026);
    expect(m.rows[0]!.compare).toBeCloseTo(26.01, 10);
    expect(m.rows[11]!.compare).toBeNull();
  });

  it('CSV con «;», coma decimal y faltante vacío; exporta SVG', () => {
    const m = buildSeasonality(synthetic, { kind: 'range', from: 2026, to: 2026 }, 2026);
    const csv = seasonalityCsv(m, 'Promedio 2026');
    expect(csv.startsWith('﻿mes;Promedio 2026 (%)')).toBe(true);
    expect(csv).toContain('Ene;26,01;1;2026;26,01');
    expect(csv).toContain('Dic;;0;;');
    const svg = renderSvgString(exportSeasonalityOption({ model: m, avgLabel: 'Promedio 2026', exportMeta: { title: 'Estacionalidad', subtitle: 'Var. % mensual real', source: 'Fuente: one618 en base a BCRA e INDEC.' } }));
    expect(svg).toContain('Estacionalidad');
    expect(svg).toContain('Fuente: one618 en base a BCRA e INDEC.');
  });

  it('variación real = (1 + nominal) / (1 + inflación) − 1 y excluye el mes parcial', () => {
    const obs = (date: string, value: number) => ({ date, value });
    const s = {
      def: { id: M2_PRIVADO_ID, frequency: 'D', currency: 'ARS', kind: 'stock', unit: 'Millones de ARS' },
      observations: [obs('2025-01-31', 100), obs('2025-02-28', 110), obs('2025-03-14', 120)],
    } as unknown as MonetarySeries;
    const ipc = [{ period: '2025-01', value: 100 }, { period: '2025-02', value: 105 }, { period: '2025-03', value: 107 }];
    const out = realMonthlyChanges(s, ipc, 'mean', '2025-03-20');
    expect(out.map((c) => c.period)).toEqual(['2025-02']);
    expect(out[0]!.value).toBeCloseTo((1.1 / 1.05 - 1) * 100, 10);
  });
});

const store = readMonetaryStore();
const m2 = deriveMonetarySeries(store.series).find((s) => s.def.id === M2_PRIVADO_ID);
const ipc = getClientSeries('precios.ipc.ng.nacional')?.observations.map((o) => ({ period: o.period, value: o.value })) ?? [];
describe.skipIf(!m2 || !ipc.length)('estacionalidad del M2 privado (store real)', () => {
  it('10 años por mes salvo nov–dic (sin IPC antes de dic-2016) y diciembre con suba estacional', () => {
    const changes = realMonthlyChanges(m2, ipc, 'mean', store.updatedAt?.slice(0, 10));
    expect(changes[0]!.period).toBe('2017-01');
    const m = buildSeasonality(changes, { kind: 'last', years: 10 });
    expect(m.rows.every((r) => r.count >= 9)).toBe(true);
    const dec = m.rows[11]!.mean!, feb = m.rows[1]!.mean!;
    expect(dec).toBeGreaterThan(0);
    expect(feb).toBeLessThan(0);
  });
});
