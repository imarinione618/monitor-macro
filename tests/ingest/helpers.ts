/**
 * Utilidades de prueba: emulador mínimo de PostgREST (filtros eq/gte/lte/in, select,
 * limit/offset con tope de filas, Content-Range) para mockear fetch, y lector de
 * muestras reales de tests/fixtures/real.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IndecClient, type ClientOptions, type Row } from '../../src/ingest/client';

export const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.firma-de-prueba';

export function realFixture(name: string): Row[] {
  return JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/real', `${name}.json`), 'utf8')) as Row[];
}

export function tmpDir(prefix = 'indec-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function parseList(s: string): string[] {
  // in.(a,"b c",d) -> ["a","b c","d"]
  const inner = s.replace(/^\(/, '').replace(/\)$/, '');
  const out: string[] = [];
  let cur = '', q = false;
  for (const ch of inner) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function matchFilter(v: unknown, expr: string): boolean {
  const sv = v === null || v === undefined ? null : String(v);
  if (expr.startsWith('eq.')) return sv === expr.slice(3);
  if (expr.startsWith('gte.')) return sv !== null && sv >= expr.slice(4);
  if (expr.startsWith('lte.')) return sv !== null && sv <= expr.slice(4);
  if (expr.startsWith('in.')) return sv !== null && parseList(expr.slice(3)).includes(sv);
  if (expr === 'not.is.null') return sv !== null;
  if (expr === 'is.null') return sv === null;
  throw new Error(`Filtro no soportado en el emulador: ${expr}`);
}

export interface FakeServer {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  calls: { url: string; headers: Record<string, string> }[];
  tables: Record<string, Row[]>;
  /** Respuesta forzada por tabla (p.ej. errores); devolver undefined para seguir normal. */
  override?: (table: string, url: URL, callIndex: number) => Response | undefined;
}

export function fakePostgrest(tables: Record<string, Row[]>, opts: { maxRows?: number; requireToken?: string } = {}): FakeServer {
  const maxRows = opts.maxRows ?? 1000;
  const server: FakeServer = {
    tables,
    calls: [],
    fetch: async (input, init) => {
      const url = new URL(input);
      const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
      server.calls.push({ url: input, headers });
      const table = url.pathname.replace(/^\/v1\//, '').replace(/^\//, '');
      const forced = server.override?.(table, url, server.calls.length - 1);
      if (forced) return forced;
      const token = opts.requireToken ?? TEST_TOKEN;
      if (headers.authorization !== `Bearer ${token}`) {
        return new Response(JSON.stringify({ code: '42501', details: null, hint: null, message: 'permission denied for schema api' }), { status: 401 });
      }
      const rows = server.tables[table];
      if (!rows) return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
      let res = rows;
      let limit = Infinity, offset = 0, select: string[] | null = null;
      for (const [k, v] of url.searchParams) {
        if (k === 'limit') limit = Number(v);
        else if (k === 'offset') offset = Number(v);
        else if (k === 'order') continue; // las tablas de prueba ya vienen ordenadas
        else if (k === 'select') select = v.split(',');
        else res = res.filter((r) => matchFilter(r[k], v));
      }
      const total = res.length;
      const n = Math.min(limit, maxRows);
      const page = res.slice(offset, offset + n).map((r) => (select ? Object.fromEntries(select.map((c) => [c, r[c]])) : r));
      const range = page.length ? `${offset}-${offset + page.length - 1}/${total}` : `*/${total}`;
      return new Response(JSON.stringify(page), {
        status: page.length < total ? 206 : 200,
        headers: { 'Content-Range': range, 'Content-Type': 'application/json' },
      });
    },
  };
  return server;
}

export function testClient(server: FakeServer, extra: Partial<ClientOptions> = {}): IndecClient {
  return new IndecClient({
    baseUrl: 'https://api.example.test/v1',
    token: TEST_TOKEN,
    minIntervalMs: 0,
    maxRetries: 2,
    backoffBaseMs: 1,
    sleep: async () => {},
    fetchImpl: server.fetch,
    ...extra,
  });
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
