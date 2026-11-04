import { describe, expect, it } from 'vitest';
import { baseInstrumentComponents, deriveMonetarySeries, ELIGIBLE_BALANCE_V1, prepareComposition, prepareSeries } from '../../src/monetary/analytics';
import { MONETARY_BY_BCRA_ID } from '../../src/monetary/catalog';
import type { MonetarySeries } from '../../src/monetary/types';

const make = (id: number, rows: [string, number | null][]): MonetarySeries => ({
  def: MONETARY_BY_BCRA_ID.get(id)!, observations: rows.map(([date, value]) => ({ date, value })),
  retrievedAt: '2026-11-04T19:00:00Z', stale: false,
});
const total = (input: MonetarySeries[]) => deriveMonetarySeries(input).find(s => s.def.id === 'monetario.base_instrumentos.v2')!;
const options = { frequency: 'M' as const, monthlyMode: 'mean' as const, valueMode: 'nominal' as const, transform: 'level' as const, asOf: '2026-11-04' };

describe('base e instrumentos con Repo BCRA 198', () => {
  it('suma Repo en la misma fecha y excluye activos y LEFI', () => {
    const input = [[1248,47321620],[1258,243895],[1260,0],[1262,0],[198,1326629.282],[154,500],[196,700]].map(([id,value]) => make(id!, [['2026-10-30',value!]]));
    expect(total(input).observations).toEqual([{ date:'2026-10-30',value:48892144.282 }]);
    expect(baseInstrumentComponents(input).map(s => s.def.shortName)).toContain('Repo BCRA');
  });

  it('conserva cobertura histórica y reconcilia barras con el total en el mes de incorporación', () => {
    const input = ELIGIBLE_BALANCE_V1.map(id => make(id, [['2018-01-31',10],['2025-07-14',10],['2025-07-15',20],['2025-07-31',30]]));
    const repo = make(198, [['2025-07-15',5],['2025-07-31',10]]);
    input.push(repo);
    const before = JSON.stringify(repo);
    const aggregate = total(input);
    expect(aggregate.observations.map(o => o.value)).toEqual([40,40,85,130]);
    const components = baseInstrumentComponents(input);
    expect(components.at(-1)?.def.bcraId).toBe(0); // Aporte propio, no saldo oficial retroactivo.
    for (const monthlyMode of ['mean','close'] as const) {
      const opts = { ...options, monthlyMode };
      const bars = prepareComposition(components, opts);
      for (const point of prepareSeries(aggregate, opts)) {
        expect(bars.reduce((sum, series) => sum + series.find(p => p.period === point.period)!.value!, 0)).toBeCloseTo(point.value!);
      }
    }
    expect(JSON.stringify(repo)).toBe(before);
    expect(repo.observations[0]?.date).toBe('2025-07-15');
  });

  it('un Repo faltante desde el comienzo de cobertura impide el total, aunque su primer dato almacenado sea posterior', () => {
    const input = ELIGIBLE_BALANCE_V1.map(id => make(id, [['2025-07-15',10],['2025-07-16',10],['2025-07-17',10]]));
    input.push(make(198, [['2025-07-16',0],['2025-07-17',null]]));
    expect(total(input).observations.map(o => o.value)).toEqual([null,40,null]);
    expect(prepareComposition(baseInstrumentComponents(input), { ...options, frequency:'D' }).every(s => s[0]?.value === null && s[2]?.value === null)).toBe(true);
  });
});
