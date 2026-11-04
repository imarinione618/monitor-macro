import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { getSeries } from '../../src/core/registry';
import { readManifest, readRevisions, readSeriesData, readNomenclaturas } from '../../src/core/store';
import type { SeriesData, SeriesDef } from '../../src/core/types';
import type { Row } from '../../src/ingest/client';
import { runRefresh, type RefreshOptions } from '../../src/ingest/refresh';
import { fakePostgrest, realFixture, testClient, tmpDir, type FakeServer } from './helpers';

const EMAE = 'estimador-mensual-de-actividad-economica-nivel-general';
const EXPO = 'comercio_exterior_exportacion_bienes';
const SAL = 'indice_salarios';
const NOW = new Date('2026-11-04T12:00:00Z');

function emaeRows(periods: string[], f: (tipo: string, i: number) => number): Row[] {
  const out: Row[] = [];
  periods.forEach((p, i) => {
    for (const tipo of ['Índice serie desestacionalizada', 'Índice serie original']) {
      out.push({ tipo_de_indicador_descripcion: tipo, anio: Number(p.slice(0, 4)), mes: Number(p.slice(4)), periodo: p, tipo_de_indicador: 'Índice base 2004=100', valor: f(tipo, i), valor_null: null, observaciones: null });
    }
  });
  return out;
}

function months(from: string, n: number): string[] {
  let y = Number(from.slice(0, 4)), m = Number(from.slice(4));
  return Array.from({ length: n }, () => {
    const p = `${y}${String(m).padStart(2, '0')}`;
    m++;
    if (m > 12) (m = 1), y++;
    return p;
  });
}

function expoRows(periods: string[]): Row[] {
  const out: Row[] = [];
  periods.forEach((p, i) => {
    const base = { Anio: Number(p.slice(0, 4)), Mes: Number(p.slice(4)), Periodo: p };
    out.push({ ...base, rubro_cod: '1', subrubro_cod: '101', pais_cod: 'AE', valor_FOB: null, valor_FOB_null: 's', Peso_Neto: null });
    out.push({ ...base, rubro_cod: '1', subrubro_cod: '101', pais_cod: 'BR', valor_FOB: 1_000_000 + i, valor_FOB_null: null, Peso_Neto: 1 });
    out.push({ ...base, rubro_cod: '9', subrubro_cod: '999', pais_cod: 'XR', valor_FOB: 500_000, valor_FOB_null: null, Peso_Neto: 1 });
  });
  return out;
}

const salRows = (): Row[] =>
  months('202401', 6).map((p, i) => ({ clasificador: 'IS 2001', nivel: '1', codigo: '100', descripcion: 'Total registrado', periodo: p, anio: Number(p.slice(0, 4)), mes: Number(p.slice(4)), indicador: 'IS', tipo_de_indicador: 'Indice', tipo_de_indicador_descripcion: 'x', unidad_de_medida: 'Unidad', valor: 1000 + i * 10, valor_null: null, observaciones: null }));

const derivedDiff: SeriesDef = {
  ...getSeries('comex.saldo'),
  id: 'test.emae.orig_menos_sa',
  topic: 'actividad',
  source: { kind: 'derived', op: { type: 'difference', minuend: 'actividad.emae.total.orig', subtrahend: 'actividad.emae.total.sa' } },
};

const SERIES_UNDER_TEST: SeriesDef[] = [
  getSeries('actividad.emae.total.orig'),
  getSeries('actividad.emae.total.sa'),
  getSeries('comex.expo.total'),
  getSeries('comex.expo.pais.brasil'),
  getSeries('laboral.salarios.registrado'),
  derivedDiff,
];

let dir: string;
let server: FakeServer;

function opts(extra: Partial<RefreshOptions> = {}): RefreshOptions {
  return {
    client: testClient(server, { maxRetries: 1 }),
    storeDir: path.join(dir, 'store'),
    lockFile: path.join(dir, '.lock'),
    runsDir: null,
    series: SERIES_UNDER_TEST,
    now: () => NOW,
    log: () => {},
    ...extra,
  };
}

const store = () => path.join(dir, 'store');
const obsOf = (id: string) => readSeriesData(id, store())?.observations;
const stripVolatile = (d: SeriesData | null) => d && { ...d, meta: { ...d.meta, retrievedAt: '', runId: '' } };

beforeEach(() => {
  dir = tmpDir();
  server = fakePostgrest({
    [EMAE]: emaeRows(months('202401', 6), (tipo, i) => (tipo.includes('original') ? 100 + i : 99 + i * 1.5)),
    [EXPO]: expoRows(months('202301', 45)), // 2023-01 … 2026-09
    [SAL]: salRows(),
    comercio_exterior_nomenclaturas: realFixture('comex-nomenclaturas'),
  });
});

describe('runRefresh', () => {
  it('primera corrida: escribe series, manifest y nomenclaturas; sin revisiones', async () => {
    const s = await runRefresh(opts());
    expect(s.ok).toBe(true);
    expect(s.revisions).toEqual([]);
    expect(obsOf('actividad.emae.total.orig')).toHaveLength(6);
    const expo = readSeriesData('comex.expo.total', store())!;
    expect(expo.observations).toHaveLength(45);
    expect(expo.observations[0]!.value).toBeCloseTo(1.5, 12); // (1.000.000 + 500.000) USD → millones
    expect(expo.meta.suppressedRows).toBe(45);
    expect(expo.meta.query).not.toContain('Bearer');
    expect(obsOf('test.emae.orig_menos_sa')![0]!.value).toBeCloseTo(1, 12);
    const m = readManifest(store())!;
    expect(m.dataMode).toBe('real');
    expect(m.lastRun).toMatchObject({ ok: true, partial: false });
    expect(m.datasets[EXPO]).toMatchObject({ ok: true, mode: 'full', lastFullReconcileAt: NOW.toISOString(), totalRows: 135 });
    expect(m.series['comex.expo.total']).toMatchObject({ firstPeriod: '2023-01', lastPeriod: '2026-09', count: 45, stale: false });
    expect(readNomenclaturas(store())!.rubro_cod).toBeDefined();
    expect(fs.existsSync(path.join(dir, '.lock'))).toBe(false);
  });

  it('idempotencia: una segunda corrida igual no cambia datos ni agrega revisiones; comercio pasa a ventana', async () => {
    await runRefresh(opts());
    const before = SERIES_UNDER_TEST.map((d) => stripVolatile(readSeriesData(d.id, store())));
    server.calls.length = 0;
    const s2 = await runRefresh(opts());
    expect(s2.ok).toBe(true);
    expect(s2.revisions).toEqual([]);
    expect(readRevisions(store())).toEqual([]);
    const after = SERIES_UNDER_TEST.map((d) => stripVolatile(readSeriesData(d.id, store())));
    // en modo ventana, suppressedRows refleja la ventana descargada
    expect(after.map((d) => ({ ...d, meta: { ...d!.meta, suppressedRows: undefined, query: undefined } }))).toEqual(
      before.map((d) => ({ ...d, meta: { ...d!.meta, suppressedRows: undefined, query: undefined } })),
    );
    const expoCalls = server.calls.filter((c) => c.url.includes(EXPO));
    expect(expoCalls.length).toBeGreaterThan(0);
    for (const c of expoCalls) expect(new URL(c.url).searchParams.get('Periodo')).toBe('gte.202411');
    expect(s2.datasets.find((d) => d.dataset === EXPO)!.mode).toBe('windowed');
    expect(obsOf('comex.expo.total')).toHaveLength(45);
  });

  it('detecta revisiones, pero no trata como revisión los períodos nuevos al final', async () => {
    await runRefresh(opts());
    const t = server.tables[EMAE]!;
    const row = t.find((r) => r.periodo === '202402' && String(r.tipo_de_indicador_descripcion).includes('desestacionalizada'))!;
    row.valor = 123.456;
    t.push(...emaeRows(['202407'], () => 105));
    const s = await runRefresh(opts());
    expect(s.ok).toBe(true);
    const revs = readRevisions(store());
    expect(revs.map((r) => [r.seriesId, r.period, r.kind])).toEqual([
      ['actividad.emae.total.sa', '2024-02', 'revised'],
      ['test.emae.orig_menos_sa', '2024-02', 'revised'],
    ]);
    expect(revs[0]).toMatchObject({ oldValue: 100.5, newValue: 123.456 });
    expect(s.series.find((x) => x.id === 'actividad.emae.total.orig')).toMatchObject({ newPeriods: 1, revisions: 0 });
    expect(obsOf('actividad.emae.total.orig')).toHaveLength(7);
  });

  it('revisión dentro de la ventana de comercio y reconciliación completa con --full', async () => {
    await runRefresh(opts());
    // revisión reciente (dentro de la ventana) → detectada en modo ventana
    server.tables[EXPO]!.find((r) => r.Periodo === '202609' && r.pais_cod === 'BR')!.valor_FOB = 2_000_000;
    // revisión antigua (fuera de la ventana) → solo la ve la reconciliación completa
    server.tables[EXPO]!.find((r) => r.Periodo === '202301' && r.pais_cod === 'BR')!.valor_FOB = 3_000_000;
    const s2 = await runRefresh(opts());
    expect(s2.revisions.filter((r) => r.seriesId === 'comex.expo.total').map((r) => r.period)).toEqual(['2026-09']);
    const s3 = await runRefresh(opts({ full: true }));
    expect(s3.datasets.find((d) => d.dataset === EXPO)!.mode).toBe('full');
    expect(s3.revisions.filter((r) => r.seriesId === 'comex.expo.total').map((r) => r.period)).toEqual(['2023-01']);
  });

  it('falla parcial: el dataset caído conserva el último dato válido marcado stale', async () => {
    await runRefresh(opts());
    const prev = obsOf('laboral.salarios.registrado');
    server.override = (table) => (table === SAL ? new Response('caído', { status: 503 }) : undefined);
    const s = await runRefresh(opts());
    expect(s.ok).toBe(false);
    expect(s.partial).toBe(true);
    const sal = readSeriesData('laboral.salarios.registrado', store())!;
    expect(sal.observations).toEqual(prev);
    expect(sal.meta.stale).toBe(true);
    const m = readManifest(store())!;
    expect(m.series['laboral.salarios.registrado']).toMatchObject({ stale: true, count: 6 });
    expect(m.series['laboral.salarios.registrado']!.error).toMatch(/503/);
    expect(m.datasets[SAL]).toMatchObject({ ok: false, error: { kind: 'server', httpStatus: 503 } });
    expect(m.datasets[EMAE]!.ok).toBe(true);
    expect(readSeriesData('actividad.emae.total.orig', store())!.meta.stale).toBe(false);
    // al recuperarse, deja de estar stale
    server.override = undefined;
    const s3 = await runRefresh(opts());
    expect(s3.ok).toBe(true);
    expect(readSeriesData('laboral.salarios.registrado', store())!.meta.stale).toBe(false);
  });

  it('duplicados en la fuente: la serie afectada no se sobrescribe; las demás sí', async () => {
    await runRefresh(opts());
    const prev = obsOf('actividad.emae.total.orig');
    const t = server.tables[EMAE]!;
    t.push({ ...t.find((r) => r.periodo === '202403' && String(r.tipo_de_indicador_descripcion).includes('original'))!, valor: 1 });
    t.push(...emaeRows(['202407'], () => 105));
    const s = await runRefresh(opts());
    expect(s.ok).toBe(false);
    expect(s.errors.join()).toMatch(/duplicados/);
    expect(obsOf('actividad.emae.total.orig')).toEqual(prev);
    expect(readSeriesData('actividad.emae.total.orig', store())!.meta.stale).toBe(true);
    expect(obsOf('actividad.emae.total.sa')).toHaveLength(7);
  });

  it('error de autenticación: no reintenta, interrumpe y conserva todo', async () => {
    await runRefresh(opts());
    const bad = fakePostgrest(server.tables, { requireToken: 'token-correcto' });
    const s = await runRefresh({ ...opts(), client: testClient(bad, { maxRetries: 3 }) });
    expect(s.ok).toBe(false);
    expect(bad.calls).toHaveLength(1);
    expect(s.series.every((x) => !x.ok || x.id === derivedDiff.id)).toBe(true);
    expect(obsOf('actividad.emae.total.orig')).toHaveLength(6);
    expect(readManifest(store())!.datasets[EMAE]!.error!.kind).toBe('auth');
  });

  it('--dataset limita la corrida y no toca el resto', async () => {
    await runRefresh(opts());
    const salBefore = readSeriesData('laboral.salarios.registrado', store())!;
    const s = await runRefresh(opts({ datasets: [EMAE] }));
    expect(s.ok).toBe(true);
    expect(s.datasets.map((d) => d.dataset)).toEqual([EMAE]);
    expect(readSeriesData('laboral.salarios.registrado', store())).toEqual(salBefore);
  });

  it('lock: no corre si hay otra ingesta activa', async () => {
    fs.writeFileSync(path.join(dir, '.lock'), JSON.stringify({ pid: process.pid, hostname: os.hostname(), startedAt: new Date().toISOString(), runId: 'otra' }));
    await expect(runRefresh(opts({ now: () => new Date() }))).rejects.toThrow(/otra ingesta en curso/);
  });
});
