/**
 * Contraste calculado vs publicado DENTRO del store real: las series `*_pub`
 * (variaciones publicadas por la API) contra las transformaciones de
 * src/core/transforms.ts sobre los índices. Toda la historia, no solo el último dato.
 * Se saltea si no hay store real.
 */
import { describe, expect, it } from 'vitest';
import { getSeries } from '../../src/core/registry';
import { transformSeries } from '../../src/core/views';
import type { TransformId } from '../../src/core/types';
import { load, requireRealStore, valueMap } from './helpers';

const st = requireRealStore('publicado vs calculado');

function maxDiff(indexId: string, t: TransformId, pubId: string): { n: number; max: number; worst: string } {
  const calc = new Map(transformSeries(getSeries(indexId), load(indexId), t).map((p) => [p.period, p.value]));
  const pub = valueMap(load(pubId).observations);
  let n = 0, max = 0, worst = '';
  for (const [p, v] of pub) {
    const c = calc.get(p);
    if (v === null || c === null || c === undefined) continue;
    n++;
    const d = Math.abs(c - v);
    if (d > max) (max = d), (worst = p);
  }
  return { n, max, worst };
}

describe.skipIf(!st.ok)('store real — variaciones publicadas vs calculadas', () => {
  it('EMAE var. i.a. (serie original): idéntica a la publicada (la API no la redondea)', () => {
    const r = maxDiff('actividad.emae.total.orig', 'pct_yoy', 'actividad.emae.total.orig.var_ia_pub');
    expect(r.n).toBeGreaterThan(200);
    expect(r.max).toBeLessThan(1e-9);
  });

  it('EMAE var. m/m (desestacionalizada): idéntica a la publicada', () => {
    const r = maxDiff('actividad.emae.total.sa', 'pct_prev', 'actividad.emae.total.sa.var_m_pub');
    expect(r.n).toBeGreaterThan(200);
    expect(r.max).toBeLessThan(1e-9);
  });

  it('IPC nacional var. m/m: diferencia ≤ 0,05 p.p. (redondeo a 1 decimal de la publicada)', () => {
    const r = maxDiff('precios.ipc.ng.nacional', 'pct_prev', 'precios.ipc.ng.nacional.var_m_pub');
    expect(r.n).toBeGreaterThan(100);
    expect(r.max).toBeLessThanOrEqual(0.05 + 1e-9);
  });
});
