import { describe, expect, it } from 'vitest';
import { readSeriesData } from '../../src/core/store';

const map = (id: string) => new Map((readSeriesData(id)?.observations ?? []).map((o) => [o.period, o.value]));
const real = readSeriesData('fiscal.resultado.primario');

describe.skipIf(!real)('fiscal (store real) — identidades contables del IMIG', () => {
  it('ingresos − gasto primario = resultado primario; primario − intereses = financiero', () => {
    const ing = map('fiscal.ingresos.total'), gp = map('fiscal.gastos.primario'), rp = map('fiscal.resultado.primario'), int = map('fiscal.gastos.intereses'), rf = map('fiscal.resultado.financiero');
    let n = 0;
    for (const [p, v] of rp) {
      if (v === null) continue;
      n++;
      expect(Math.abs(ing.get(p)! - gp.get(p)! - v), p).toBeLessThan(0.01);
      expect(Math.abs(v - int.get(p)! - rf.get(p)!), p).toBeLessThan(0.01);
    }
    expect(n).toBeGreaterThan(100);
  });
  it('septiembre 2026 coincide con lo publicado (millones de $)', () => {
    const rp = map('fiscal.resultado.primario').get('2026-09');
    if (rp == null) return;
    expect(rp).toBeCloseTo(1_427_640, 0);
    expect(map('fiscal.resultado.financiero').get('2026-09')).toBeCloseTo(977_173.4, 0);
  });
});
