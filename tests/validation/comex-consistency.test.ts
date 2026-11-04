/**
 * Consistencia contable del comercio exterior en el store REAL:
 *  - saldo = exportaciones − importaciones, exacto, en todos los meses;
 *  - suma de grandes rubros (incluido el 9 "Confidencial") = total exportado;
 *  - suma de usos económicos = total importado.
 * Se saltea si no hay store real.
 */
import { describe, expect, it } from 'vitest';
import { load, requireRealStore, valueMap } from './helpers';

const st = requireRealStore('consistencia de comercio exterior');

const RUBROS = ['pp', 'moa', 'moi', 'cye', 'confidencial'].map((s) => `comex.expo.rubro.${s}`);
const USOS = ['bk', 'bi', 'cyl', 'pyabk', 'bc', 'vap', 'resto'].map((s) => `comex.impo.uso.${s}`);

/** Diferencias |Σ partes − total| por período que superan la tolerancia (millones de USD). */
function sumMismatches(totalId: string, partIds: string[], tol = 1e-6): string[] {
  const total = load(totalId).observations;
  const parts = partIds.map((id) => valueMap(load(id).observations));
  const out: string[] = [];
  for (const o of total) {
    if (o.value === null) continue;
    const s = parts.reduce((acc, m) => acc + (m.get(o.period) ?? 0), 0);
    if (Math.abs(s - o.value) > tol) out.push(`${o.period}: Σ=${s.toFixed(4)} total=${o.value.toFixed(4)}`);
  }
  return out;
}

describe.skipIf(!st.ok)('store real — comercio exterior', () => {
  it('saldo = X − M exacto en todos los meses (mismos períodos en las tres series)', () => {
    const x = valueMap(load('comex.expo.total').observations);
    const m = valueMap(load('comex.impo.total').observations);
    const s = load('comex.saldo').observations;
    expect(s.length).toBe(x.size);
    expect(s.length).toBe(m.size);
    const bad = s.filter((o) => {
      const a = x.get(o.period), b = m.get(o.period);
      if (a == null || b == null) return o.value !== null;
      return o.value === null || Math.abs(o.value - (a - b)) > 1e-9;
    });
    expect(bad).toEqual([]);
  });

  it('Σ grandes rubros (PP + MOA + MOI + CyE + Confidencial) = exportaciones totales', () => {
    expect(sumMismatches('comex.expo.total', RUBROS)).toEqual([]);
  });

  it('Σ usos económicos = importaciones totales', () => {
    expect(sumMismatches('comex.impo.total', USOS)).toEqual([]);
  });

  it('el rubro Confidencial existe desde 2018-01 y es no nulo (las celdas "s" se concentran allí)', () => {
    const c = load('comex.expo.rubro.confidencial').observations;
    expect(c[0]!.period).toBe('2018-01');
    expect(c.every((o) => o.value !== null && o.value >= 0)).toBe(true);
  });

  it('los socios (país) no superan el total del período', () => {
    const tx = valueMap(load('comex.expo.total').observations);
    const tm = valueMap(load('comex.impo.total').observations);
    for (const [id, tot] of [
      ['comex.expo.pais.brasil', tx],
      ['comex.expo.pais.china', tx],
      ['comex.expo.pais.eeuu', tx],
      ['comex.impo.pais.brasil', tm],
      ['comex.impo.pais.china', tm],
      ['comex.impo.pais.eeuu', tm],
    ] as const) {
      const over = load(id).observations.filter((o) => o.value !== null && o.value > (tot.get(o.period) ?? Infinity));
      expect(over, id).toEqual([]);
    }
  });
});
