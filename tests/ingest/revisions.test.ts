import { describe, expect, it } from 'vitest';
import { countNewPeriods, detectRevisions, mergeWindow, sameValue } from '../../src/ingest/revisions';
import type { Observation } from '../../src/core/types';

const ctx = { runId: 'r1', detectedAt: '2026-11-04T00:00:00.000Z' };
const s = (pairs: [string, number | null][]): Observation[] => pairs.map(([period, value]) => ({ period, value }));

describe('detección de revisiones', () => {
  const old = s([
    ['2024-01', 100],
    ['2024-02', 101],
    ['2024-04', 103],
  ]);

  it('primera carga: sin revisiones', () => {
    expect(detectRevisions('x', null, old, ctx)).toEqual([]);
    expect(detectRevisions('x', [], old, ctx)).toEqual([]);
  });

  it('datos idénticos (o diferencias por debajo de la tolerancia relativa) no son revisión', () => {
    expect(detectRevisions('x', old, old, ctx)).toEqual([]);
    const tiny = s([
      ['2024-01', 100 * (1 + 1e-12)],
      ['2024-02', 101],
      ['2024-04', 103],
    ]);
    expect(detectRevisions('x', old, tiny, ctx)).toEqual([]);
    expect(sameValue(0.1 + 0.2, 0.3)).toBe(true);
    expect(sameValue(100, 100.001)).toBe(false);
    expect(sameValue(null, 0)).toBe(false);
  });

  it('nuevos períodos al final NO son revisión', () => {
    const nw = [...old, ...s([['2024-05', 104]])];
    expect(detectRevisions('x', old, nw, ctx)).toEqual([]);
    expect(countNewPeriods(old, nw)).toBe(1);
  });

  it('valor cambiado → revised; hueco histórico completado → added_historical; desaparecido → removed', () => {
    const nw = s([
      ['2024-01', 100.5],
      ['2024-03', 102],
      ['2024-04', 103],
      ['2024-05', 104],
    ]);
    const r = detectRevisions('x', old, nw, ctx);
    expect(r.map((x) => [x.period, x.kind, x.oldValue, x.newValue])).toEqual([
      ['2024-01', 'revised', 100, 100.5],
      ['2024-02', 'removed', 101, null],
      ['2024-03', 'added_historical', null, 102],
    ]);
    expect(r[0]).toMatchObject({ seriesId: 'x', runId: 'r1', detectedAt: ctx.detectedAt });
  });

  it('número → null (o viceversa) es revisión', () => {
    const nw = s([
      ['2024-01', null],
      ['2024-02', 101],
      ['2024-04', 103],
    ]);
    expect(detectRevisions('x', old, nw, ctx)[0]).toMatchObject({ kind: 'revised', oldValue: 100, newValue: null });
  });

  it('modo ventana: solo compara desde el inicio de la ventana', () => {
    const window = s([['2024-04', 103]]);
    const merged = mergeWindow(old, window, '2024-03');
    expect(merged).toEqual(old);
    expect(detectRevisions('x', old, merged, { ...ctx, scopeFrom: '2024-03' })).toEqual([]);
    const merged2 = mergeWindow(old, s([['2024-04', 110]]), '2024-03');
    const r = detectRevisions('x', old, merged2, { ...ctx, scopeFrom: '2024-03' });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ period: '2024-04', kind: 'revised' });
  });
});
