import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EESS_PACKAGE_URL, EESS_VIGENTE_RESOURCE_ID, FUEL_DEFS, SURTIDOR_HISTORICO_URL, SURTIDOR_VIGENTES_URL, eessId, surtidorId,
} from '../../src/combustibles/defs';
import { diffObservations, refreshCombustibles } from '../../src/combustibles/refresh';
import { readFuelManifest, readFuelSeries, readFuelStore, readSurtidorState } from '../../src/combustibles/store';
import { addDays } from '../../src/combustibles/surtidor';
import type { FuelRevision } from '../../src/combustibles/types';
import { cleanup, eessAnualCsv, eessVigenteCsv, historicoCsv, tmpDir, vigentesCsv, type EessRow, type Ev } from './helpers';

afterEach(cleanup);
const quiet = () => {};
const PRODUCT_IDS = ['2', '3', '19', '21'];
const SUPER = surtidorId('super', 'nacional');

/** 6 estaciones (4–6 en CABA) × 4 productos; precio = base + estación, un cambio cada 30 días. */
function history(until: string): Ev[] {
  const events: Ev[] = [];
  for (let d = '2017-12-01', k = 0; d <= until; d = addDays(d, 30), k++) {
    for (const product of PRODUCT_IDS) for (let station = 1; station <= 6; station++) {
      events.push({ station, product, price: 100 + k + station, at: `${d} 1${station}:00`, province: station > 3 ? 'CAPITAL FEDERAL' : 'BUENOS AIRES' });
    }
  }
  return events;
}
const latestPerKey = (events: Ev[]) => [...new Map(events.map(e => [`${e.station}|${e.product}`, e])).values()];

const ANNUAL_URL = 'http://test/eess-2023.csv';
const EESS_VIG_URL = 'http://test/eess-vigente.csv';
function eessRows(periods: string[], price: number): EessRow[] {
  const products = ['Nafta (súper) entre 92 y 95 Ron', 'Nafta (premium) de más de 95 Ron', 'Gas Oil Grado 2', 'Gas Oil Grado 3'];
  return periods.flatMap(period => products.flatMap(product => [1, 2, 3, 4, 5, 6].map((i): EessRow => ({ period, product, price: price + i, volume: 10 * i, province: i > 3 ? 'CAPITAL FEDERAL' : 'SALTA' }))));
}

type Body = string | (() => Response);
function server(initial: Record<string, Body>) {
  const routes = new Map<string, Body>(Object.entries(initial));
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const body = routes.get(url);
    if (body === undefined) return new Response('no encontrado', { status: 404 });
    return typeof body === 'function' ? body() : new Response(body);
  }) as typeof fetch;
  return { routes, calls, fetcher };
}

function baseRoutes(): Record<string, Body> {
  const hist = history('2024-03-05');
  return {
    [SURTIDOR_HISTORICO_URL]: historicoCsv(hist),
    [SURTIDOR_VIGENTES_URL]: vigentesCsv([...latestPerKey(hist), { station: 3, product: '2', price: 180, at: '2024-03-08 10:00' }]),
    [EESS_PACKAGE_URL]: JSON.stringify({ success: true, result: { resources: [
      { id: 'anual', name: 'Precios EESS 2023', url: ANNUAL_URL },
      { id: 'viejo', name: 'Precios EESS 2015', url: 'http://test/eess-2015.csv' },
      { id: EESS_VIGENTE_RESOURCE_ID, name: 'Precios EESS desde Diciembre2024', url: EESS_VIG_URL },
    ] } }),
    [ANNUAL_URL]: eessAnualCsv(eessRows(['2023/11', '2023/12'], 500)),
    [EESS_VIG_URL]: eessVigenteCsv(eessRows(['2023/12', '2024/01'], 600)),
  };
}

const revisionsOf = (dir: string): FuelRevision[] => {
  const file = path.join(dir, 'revisions.jsonl');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [];
};
const at = (iso: string) => () => new Date(iso);

describe('refreshCombustibles', () => {
  it('carga inicial, corrida diaria con revisiones y conservación ante fallas', async () => {
    const dir = tmpDir();
    const { routes, calls, fetcher } = server(baseRoutes());
    const opts = { dir, log: quiet, fetch: fetcher, retries: 0 };

    // 1) Carga inicial: histórico + vigentes, anuales + vigente 1104.
    const first = await refreshCombustibles({ ...opts, now: at('2024-03-10T15:00:00Z') });
    expect(first).toMatchObject({ ok: true, surtidor: { ok: true, mode: 'historico', lastDay: '2024-03-07' }, eess: { ok: true, annual: true, lastPeriod: '2024-01' }, revisions: 0 });
    expect(calls).not.toContain('http://test/eess-2015.csv');
    for (const def of FUEL_DEFS) expect(readFuelSeries(def.id, dir)?.stale).toBe(false);
    const superSeries = readFuelSeries(SUPER, dir)!;
    expect(superSeries.observations[0]).toMatchObject({ date: '2018-01-01' });
    expect(superSeries.observations.at(-1)!.date).toBe('2024-03-07');
    expect(superSeries.def.breaks?.[0]?.date).toBe('2025-07-01');
    // Último cambio del histórico: 28/2 con precios 177..182 → mediana 179,5; el de la estación 3 (8/3) cae después del último día cerrado.
    expect(superSeries.observations.find(o => o.date === '2024-03-06')).toEqual({ date: '2024-03-06', value: 179.5, n: 6 });
    // El archivo vigente 1104 prevalece sobre el anual en el mes superpuesto (2023-12).
    const eess = readFuelSeries(eessId('super', 'nacional'), dir)!.observations;
    expect(eess.map(o => o.date)).toEqual(['2023-11', '2023-12', '2024-01']);
    // Σ(600 + i)·10i / Σ10i = 600 + Σi² / Σi (anual: 500 + …).
    expect(eess[1]!.value).toBeCloseTo(600 + 91 / 21, 9);
    expect(eess[0]!.value).toBeCloseTo(500 + 91 / 21, 9);
    const manifest = readFuelManifest(dir)!;
    expect(manifest.surtidor).toMatchObject({ lastDay: '2024-03-07', lastEventAt: '2024-03-08 10:00', mode: 'historico' });
    expect(manifest.series[SUPER]).toMatchObject({ lastDate: '2024-03-07', lastValue: 179.5, stale: false });
    expect(Object.keys(readSurtidorState(dir)!.events).length).toBe(24);
    expect(fs.existsSync(path.join(dir, '.lock'))).toBe(false);

    // 2) Día siguiente: solo vigentes + estado. Llega tarde un cambio fechado el 6/3 → revisión.
    calls.length = 0;
    routes.set(SURTIDOR_VIGENTES_URL, vigentesCsv([
      ...latestPerKey(history('2024-03-05')),
      { station: 3, product: '2', price: 180, at: '2024-03-08 10:00' },
      { station: 1, product: '2', price: 230, at: '2024-03-06 09:00' },
      { station: 2, product: '2', price: 181, at: '2024-03-10 08:00' },
    ]));
    const second = await refreshCombustibles({ ...opts, now: at('2024-03-11T15:00:00Z') });
    expect(second).toMatchObject({ ok: true, surtidor: { mode: 'vigentes', lastDay: '2024-03-09' }, eess: { skipped: true } });
    expect(calls).toEqual([SURTIDOR_VIGENTES_URL]);
    const revisions = revisionsOf(dir);
    expect(revisions.find(r => r.id === SUPER && r.date === '2024-03-06')).toMatchObject({ oldValue: 179.5, newValue: 180.5, kind: 'revised', oldN: 6, newN: 6 });
    // Fechas nuevas (8 y 9/3) no son revisiones.
    expect(revisions.some(r => r.date > '2024-03-07')).toBe(false);
    const updated = readFuelSeries(SUPER, dir)!;
    expect(updated.observations.at(-1)).toMatchObject({ date: '2024-03-09' });
    expect(updated.observations[0]!.date).toBe('2018-01-01');

    // 3) Falla de la descarga: se conserva el último conjunto válido, marcado stale.
    routes.set(SURTIDOR_VIGENTES_URL, () => new Response('error', { status: 500 }));
    const failed = await refreshCombustibles({ ...opts, now: at('2024-03-12T15:00:00Z') });
    expect(failed.ok).toBe(false);
    expect(failed.surtidor.error).toMatch(/HTTP 500/);
    const kept = readFuelSeries(SUPER, dir)!;
    expect(kept.stale).toBe(true);
    expect(kept.error).toMatch(/HTTP 500/);
    expect(kept.observations).toEqual(updated.observations);
    expect(readFuelManifest(dir)!.series[SUPER]).toMatchObject({ stale: true, lastDate: '2024-03-09' });
    expect(readFuelSeries(eessId('super', 'nacional'), dir)!.stale).toBe(false);
    expect(revisionsOf(dir)).toHaveLength(revisions.length);
  });

  it('si el histórico falla en la reconciliación semanal usa vigentes + estado y lo reintenta después', async () => {
    const dir = tmpDir();
    const { routes, fetcher } = server(baseRoutes());
    const opts = { dir, log: quiet, fetch: fetcher, retries: 0 };
    await refreshCombustibles({ ...opts, now: at('2024-03-10T15:00:00Z') });
    routes.set(SURTIDOR_HISTORICO_URL, () => new Response('caído', { status: 503 }));
    const result = await refreshCombustibles({ ...opts, now: at('2024-03-18T15:00:00Z'), only: 'surtidor' });
    expect(result).toMatchObject({ ok: true, surtidor: { ok: true, mode: 'vigentes' } });
    const manifest = readFuelManifest(dir)!;
    expect(manifest.surtidor.error).toMatch(/Histórico no disponible/);
    expect(manifest.surtidor.lastHistoricoAt).toBe('2024-03-10T15:00:00.000Z');
  });

  it('rechaza una reconstrucción que pierde más del 20% de los datos y conserva la versión anterior', async () => {
    const dir = tmpDir();
    const { routes, fetcher } = server(baseRoutes());
    const opts = { dir, log: quiet, fetch: fetcher, retries: 0 };
    await refreshCombustibles({ ...opts, now: at('2024-03-10T15:00:00Z') });
    const before = readFuelSeries(SUPER, dir)!;
    routes.set(SURTIDOR_HISTORICO_URL, historicoCsv(history('2024-03-05').filter(e => e.at >= '2023-06-01')));
    routes.set(EESS_VIG_URL, eessVigenteCsv(eessRows(['2024/01'], 600)).replace('canal_de_comercializacion', 'canal'));
    const result = await refreshCombustibles({ ...opts, now: at('2024-03-11T15:00:00Z'), full: true });
    expect(result.surtidor).toMatchObject({ ok: false });
    expect(result.surtidor.error).toMatch(/pérdida de más del 20%/);
    expect(result.eess.error).toMatch(/cambió el esquema/);
    const after = readFuelSeries(SUPER, dir)!;
    expect(after.stale).toBe(true);
    expect(after.observations).toEqual(before.observations);
    expect(readFuelStore(dir).series).toHaveLength(16);
  });

  it('las revisiones ignoran fechas nuevas y diferencias de redondeo de punto flotante', () => {
    const prev = [{ date: '2024-01', value: 100 }, { date: '2024-02', value: 0.1 + 0.2 }, { date: '2024-03', value: 5 }];
    const next = [{ date: '2024-01', value: 101 }, { date: '2024-02', value: 0.3 }, { date: '2024-04', value: 7 }];
    expect(diffObservations('x', prev, next, '', 't', 'r').map(r => [r.date, r.kind])).toEqual([['2024-01', 'revised'], ['2024-03', 'removed']]);
    expect(diffObservations('x', prev, next, '2024-02', 't', 'r').map(r => r.date)).toEqual(['2024-03']);
  });
});
