import { describe, expect, it, vi } from 'vitest';
import { buildQueryString, IndecClient, parseContentRange, parseRetryAfter, type Row } from '../../src/ingest/client';
import { IngestError } from '../../src/ingest/errors';
import { fakePostgrest, jsonResponse, testClient, tmpDir, TEST_TOKEN } from './helpers';

const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: i, periodo: '202401', valor: i }));

describe('parseo de headers', () => {
  it('Content-Range', () => {
    expect(parseContentRange('0-999/41344')).toEqual({ start: 0, end: 999, total: 41344 });
    expect(parseContentRange('*/0')).toEqual({ start: null, end: null, total: 0 });
    expect(parseContentRange('0-9/*')).toEqual({ start: 0, end: 9, total: null });
    expect(parseContentRange(null)).toBeNull();
    expect(parseContentRange('basura')).toBeNull();
  });
  it('Retry-After en segundos y como fecha', () => {
    expect(parseRetryAfter('3')).toBe(3000);
    const now = Date.parse('2026-11-04T12:00:00Z');
    expect(parseRetryAfter('Wed, 04 Nov 2026 12:00:10 GMT', now)).toBe(10000);
    expect(parseRetryAfter('x')).toBeUndefined();
  });
  it('codifica filtros PostgREST con acentos, espacios y comillas', () => {
    const qs = buildQueryString({ nivel: 'in.("Nivel General","Categoría","División")', tipo_de_indicador: 'eq.Índice' });
    expect(qs).toBe(
      'nivel=in.(%22Nivel%20General%22%2C%22Categor%C3%ADa%22%2C%22Divisi%C3%B3n%22)&tipo_de_indicador=eq.%C3%8Dndice',
    );
    expect(decodeURIComponent(qs.split('&')[0]!.split('=')[1]!)).toBe('in.("Nivel General","Categoría","División")');
  });
});

describe('paginación', () => {
  it('descarga 2500 filas en 3 páginas ordenadas por PK y verifica el total', async () => {
    const s = fakePostgrest({ t: rows(2500) });
    const r = await testClient(s).fetchAll('/t', {}, ['id']);
    expect(r.rows).toHaveLength(2500);
    expect(r.pages).toBe(3);
    expect(s.calls.map((c) => new URL(c.url).searchParams.get('offset'))).toEqual(['0', '1000', '2000']);
    expect(new URL(s.calls[0]!.url).searchParams.get('order')).toBe('id');
    expect(r.url).not.toContain('offset');
  });

  it('página exacta de 1000 filas: una sola request', async () => {
    const s = fakePostgrest({ t: rows(1000) });
    const r = await testClient(s).fetchAll('/t', {}, ['id']);
    expect(r.rows).toHaveLength(1000);
    expect(s.calls).toHaveLength(1);
  });

  it('2000 filas exactas: dos requests, sin página vacía extra', async () => {
    const s = fakePostgrest({ t: rows(2000) });
    await testClient(s).fetchAll('/t', {}, ['id']);
    expect(s.calls).toHaveLength(2);
  });

  it('resultado vacío (Content-Range */0)', async () => {
    const s = fakePostgrest({ t: [] });
    const r = await testClient(s).fetchAll('/t', {}, ['id']);
    expect(r.rows).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('el servidor topea en 1000 aunque se pidan más: avanza por filas recibidas', async () => {
    const s = fakePostgrest({ t: rows(2300) }, { maxRows: 1000 });
    const r = await testClient(s, { pageSize: 5000 }).fetchAll('/t', {}, ['id']);
    expect(r.rows).toHaveLength(2300);
    expect(r.rows.map((x) => x.id)).toEqual([...Array(2300).keys()]);
  });

  it('Content-Range inconsistente con las filas recibidas → error de datos', async () => {
    const s = fakePostgrest({ t: rows(1500) });
    s.override = (_t, url) =>
      url.searchParams.get('offset') === '1000' ? jsonResponse(rows(3), 206, { 'Content-Range': '1000-1499/1500' }) : undefined;
    await expect(testClient(s).fetchAll('/t', {}, ['id'])).rejects.toMatchObject({ kind: 'data' });
  });

  it('total informado mayor que las filas disponibles (página vacía) → error de datos', async () => {
    const s = fakePostgrest({ t: rows(1000) });
    s.override = (_t, url) =>
      url.searchParams.get('offset') === '0' ? jsonResponse(rows(1000), 206, { 'Content-Range': '0-999/1200' }) : jsonResponse([], 200, { 'Content-Range': '*/1200' });
    await expect(testClient(s).fetchAll('/t', {}, ['id'])).rejects.toThrow(/Página vacía/);
  });

  it('el total cambia entre páginas → error de datos', async () => {
    const s = fakePostgrest({ t: rows(1500) });
    s.override = (_t, url) =>
      url.searchParams.get('offset') === '1000' ? jsonResponse(rows(500), 206, { 'Content-Range': '1000-1499/1600' }) : undefined;
    await expect(testClient(s).fetchAll('/t', {}, ['id'])).rejects.toThrow(/cambió durante la paginación/);
  });

  it('respuesta sin Content-Range → error de datos', async () => {
    const s = fakePostgrest({ t: rows(10) });
    s.override = () => jsonResponse(rows(10), 200);
    await expect(testClient(s).fetchAll('/t', {}, ['id'])).rejects.toMatchObject({ kind: 'data' });
  });

  it('exige orden por clave primaria', async () => {
    const s = fakePostgrest({ t: rows(10) });
    await expect(testClient(s).fetchAll('/t', {}, [])).rejects.toMatchObject({ kind: 'config' });
  });
});

describe('reintentos y errores', () => {
  it('reintenta 503 con backoff y luego responde', async () => {
    const s = fakePostgrest({ t: rows(5) });
    s.override = (_t, _u, i) => (i < 2 ? new Response('upstream', { status: 503 }) : undefined);
    const sleep = vi.fn(async () => {});
    const c = testClient(s, { sleep, maxRetries: 3, backoffBaseMs: 100, random: () => 0 });
    const r = await c.fetchAll('/t', {}, ['id']);
    expect(r.rows).toHaveLength(5);
    expect(sleep.mock.calls.map((x) => (x as unknown[])[0])).toEqual([100, 200]);
    expect(c.stats.retries).toBe(2);
  });

  it('respeta Retry-After en 429', async () => {
    const s = fakePostgrest({ t: rows(5) });
    s.override = (_t, _u, i) => (i === 0 ? new Response('', { status: 429, headers: { 'Retry-After': '7' } }) : undefined);
    const sleep = vi.fn(async () => {});
    await testClient(s, { sleep }).fetchAll('/t', {}, ['id']);
    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it('Retry-After: 0 (PostgREST PGRST002) no anula el backoff', async () => {
    const s = fakePostgrest({ t: rows(5) });
    s.override = (_t, _u, i) => (i < 2 ? new Response('{"code":"PGRST002"}', { status: 503, headers: { 'Retry-After': '0' } }) : undefined);
    const sleep = vi.fn(async () => {});
    await testClient(s, { sleep, maxRetries: 3, backoffBaseMs: 100, random: () => 0 }).fetchAll('/t', {}, ['id']);
    expect(sleep.mock.calls.map((x) => (x as unknown[])[0])).toEqual([100, 200]);
  });

  it('agota los reintentos en 500 → error de servidor', async () => {
    const s = fakePostgrest({ t: rows(5) });
    s.override = () => new Response('boom', { status: 500 });
    const err = await testClient(s, { maxRetries: 2 }).fetchAll('/t', {}, ['id']).catch((e) => e);
    expect(err).toBeInstanceOf(IngestError);
    expect(err.kind).toBe('server');
    expect(s.calls).toHaveLength(3);
  });

  it('401 sin reintento, clasificado como auth y sin filtrar el token', async () => {
    const s = fakePostgrest({ t: rows(5) }, { requireToken: 'otro-token' });
    const err = await testClient(s, { maxRetries: 4 }).fetchAll('/t', {}, ['id']).catch((e) => e);
    expect(err.kind).toBe('auth');
    expect(err.httpStatus).toBe(401);
    expect(err.message).toContain('permission denied for schema api');
    expect(err.message).not.toContain(TEST_TOKEN);
    expect(s.calls).toHaveLength(1);
  });

  it('error de red: reintenta y clasifica como network', async () => {
    let n = 0;
    const c = new IndecClient({
      baseUrl: 'https://x/v1',
      token: TEST_TOKEN,
      maxRetries: 1,
      minIntervalMs: 0,
      sleep: async () => {},
      fetchImpl: async () => {
        n++;
        throw new TypeError('fetch failed');
      },
    });
    const err = await c.fetchAll('/t', {}, ['id']).catch((e) => e);
    expect(err.kind).toBe('network');
    expect(n).toBe(2);
  });

  it('JSON inválido → error de datos sin reintento', async () => {
    const s = fakePostgrest({ t: rows(5) });
    s.override = () => new Response('<html>', { status: 200, headers: { 'Content-Range': '0-4/5' } });
    const err = await testClient(s).fetchAll('/t', {}, ['id']).catch((e) => e);
    expect(err.kind).toBe('data');
    expect(s.calls).toHaveLength(1);
  });

  it('el token va solo en el header Authorization, nunca en la URL', async () => {
    const s = fakePostgrest({ t: rows(1500) });
    const r = await testClient(s).fetchAll('/t', { periodo: 'gte.202401' }, ['id']);
    for (const c of s.calls) {
      expect(c.url).not.toContain(TEST_TOKEN);
      expect(c.headers.authorization).toBe(`Bearer ${TEST_TOKEN}`);
      expect(c.headers.prefer).toBe('count=exact');
    }
    expect(r.url).not.toContain(TEST_TOKEN);
  });

  it('intervalo mínimo entre requests', async () => {
    let t = 1000;
    const sleep = vi.fn(async (ms: number) => {
      t += ms;
    });
    const s = fakePostgrest({ t: rows(2500) });
    await testClient(s, { minIntervalMs: 300, now: () => t, sleep }).fetchAll('/t', {}, ['id']);
    expect(sleep.mock.calls.map((x) => (x as unknown[])[0])).toEqual([300, 300]);
  });
});

describe('caché de respuestas crudas', () => {
  it('reutiliza dentro del TTL, se ignora con useCache=false y vence', async () => {
    const dir = tmpDir();
    let t = Date.parse('2026-11-04T10:00:00Z');
    const s = fakePostgrest({ t: rows(1500) });
    const mk = (useCache = true) => testClient(s, { cacheDir: dir, cacheTtlHours: 1, useCache, now: () => t });
    await mk().fetchAll('/t', {}, ['id']);
    expect(s.calls).toHaveLength(2);
    const c2 = mk();
    const r2 = await c2.fetchAll('/t', {}, ['id']);
    expect(s.calls).toHaveLength(2);
    expect(r2.pagesFromCache).toBe(2);
    expect(r2.rows).toHaveLength(1500);
    await mk(false).fetchAll('/t', {}, ['id']);
    expect(s.calls).toHaveLength(4);
    t += 2 * 3600_000;
    await mk().fetchAll('/t', {}, ['id']);
    expect(s.calls).toHaveLength(6);
  });
});
