import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAUCION_DEF, fetchCaucion, normalizeCaucion, refreshCaucion } from '../../src/monetary/caucion';
import { readMonetaryManifest, readMonetarySeries, readMonetaryStore } from '../../src/monetary/store';

const dirs: string[] = [];
const tmp = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-caucion-')); dirs.push(dir); return dir; };
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const quiet = () => {};

describe('caución A3 (I.CAUCION)', () => {
  it('normaliza fechas mixtas, ordena y conserva el valor publicado sin redondear', () => {
    expect(normalizeCaucion([
      { date: '2026-11-05 17:00:00', value: 22.2, name: 'I.CAUCION', p1: 21.2 },
      { date: '2025-05-22 16:30:00', value: 23.55, name: 'I.CAUCION' },
      { date: '2024-11-07', value: 33.125, name: 'I.CAUCION' },
    ])).toEqual([{ date: '2024-11-07', value: 33.125 }, { date: '2025-05-22', value: 23.55 }, { date: '2026-11-05', value: 22.2 }]);
  });
  it.each([
    [[{ date: '2026-02-30', value: 20 }]],
    [[{ date: '2026-01-02', value: '20,5' }]],
    [[{ date: '2026-01-02', value: 20 }, { date: '2026-01-02 17:00:00', value: 21 }]],
    [[{ date: '2026-01-02', value: 20, name: 'OTRO' }]],
    [{ error: 'x' }],
  ])('rechaza respuestas inválidas (%j)', rows => { expect(() => normalizeCaucion(rows)).toThrow(); });

  it('consulta el cierre (closed_value=1) del rango pedido', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ date: '2026-11-05 17:00:00', value: 22.2, name: 'I.CAUCION' }])));
    expect(await fetchCaucion('2024-11-07', '2026-11-06', { fetch: fetcher, retries: 0 })).toEqual([{ date: '2026-11-05', value: 22.2 }]);
    expect(fetcher.mock.calls[0]![0]).toBe('https://ws.matbarofex.com.ar:8999/api/caucion?from=2024-11-07&to=2026-11-06&closed_value=1');
  });
  it('identifica bloqueos de WAF', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('<html>Request unsuccessful. Incapsula</html>', { status: 403 }));
    await expect(fetchCaucion('2026-01-01', '2026-01-31', { fetch: fetcher, retries: 0 })).rejects.toThrow(/WAF/);
  });

  it('guarda en el store monetario, registra revisiones y conserva datos ante falla', async () => {
    const dir = tmp();
    const now = () => new Date('2026-11-06T15:00:00Z');
    await refreshCaucion({ dir, now, log: quiet, fetch: async () => [{ date: '2026-11-04', value: 21.8 }, { date: '2026-11-05', value: 22.2 }] });
    expect(readMonetarySeries(CAUCION_DEF.id, dir)?.observations).toHaveLength(2);
    expect(readMonetaryManifest(dir)?.series[CAUCION_DEF.id]?.lastDate).toBe('2026-11-05');
    const revised = await refreshCaucion({ dir, now, log: quiet, fetch: async () => [{ date: '2026-11-04', value: 21.9 }, { date: '2026-11-05', value: 22.2 }, { date: '2026-11-06', value: 22 }] });
    expect(revised).toMatchObject({ ok: true, revisions: 1 });
    expect(fs.readFileSync(path.join(dir, 'revisions.jsonl'), 'utf8')).toContain('"oldValue":21.8');
    const failed = await refreshCaucion({ dir, now, log: quiet, fetch: async () => { throw new Error('A3 HTTP 500'); } });
    expect(failed.ok).toBe(false);
    const kept = readMonetarySeries(CAUCION_DEF.id, dir)!;
    expect(kept.stale).toBe(true);
    expect(kept.observations).toHaveLength(3);
    expect(readMonetaryStore(dir).series.find(s => s.def.id === CAUCION_DEF.id)?.def.provider).toBe('A3');
  });
});
