/**
 * Cliente HTTP de la API de INDEC (PostgREST) con fetch nativo.
 *
 *  - Autenticación: header `Authorization: Bearer <JWT>`. El token NUNCA va en la URL,
 *    en la caché, en los logs ni en los mensajes de error.
 *  - Timeout por request (AbortSignal), reintentos acotados con backoff exponencial +
 *    jitter para 5xx / 429 / errores de red; respeta `Retry-After`.
 *  - 401/403 → error de autenticación SIN reintento.
 *  - Intervalo mínimo entre requests (cortesía con la API).
 *  - Paginación completa con `limit`/`offset`, `order` por la clave primaria completa
 *    y verificación contra `Content-Range` (Prefer: count=exact). Si las filas
 *    recibidas no coinciden con el total informado → error de datos.
 *  - Caché de respuestas crudas por URL (hash SHA-256, gzip) con TTL.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { IngestError, classifyHttpStatus, redactSecrets } from './errors';

export type Row = Record<string, unknown>;
/** Parámetros PostgREST SIN codificar: { periodo: 'gte.202401', select: 'a,b' }. */
export type QueryParams = Record<string, string>;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  maxRetries?: number;
  minIntervalMs?: number;
  /** Filas por página (la API devuelve como máximo 1000 aunque se pida más). */
  pageSize?: number;
  /** Directorio de caché (null = sin caché). */
  cacheDir?: string | null;
  cacheTtlHours?: number;
  /** false = no leer la caché (sí se escribe la respuesta nueva). */
  useCache?: boolean;
  /** Tope de espera por Retry-After (ms). */
  maxRetryAfterMs?: number;
  /** Base del backoff exponencial (ms). */
  backoffBaseMs?: number;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  log?: (msg: string) => void;
}

export interface ContentRange {
  start: number | null;
  end: number | null;
  total: number | null;
}

export interface PageResult {
  rows: Row[];
  range: ContentRange | null;
  status: number;
  url: string;
  fromCache: boolean;
}

export interface FetchAllResult {
  rows: Row[];
  total: number;
  pages: number;
  pagesFromCache: number;
  /** URL de la consulta (sin limit/offset y SIN credenciales). */
  url: string;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** "0-999/41344" | "*\/0" | "0-9/*" → partes numéricas (null si "*"). */
export function parseContentRange(h: string | null | undefined): ContentRange | null {
  if (!h) return null;
  const m = /^\s*(?:(\d+)-(\d+)|\*)\/(\d+|\*)\s*$/.exec(h);
  if (!m) return null;
  return {
    start: m[1] !== undefined ? Number(m[1]) : null,
    end: m[2] !== undefined ? Number(m[2]) : null,
    total: m[3] === '*' ? null : Number(m[3]),
  };
}

/** Retry-After en segundos o fecha HTTP → ms (undefined si no se puede interpretar). */
export function parseRetryAfter(h: string | null | undefined, now = Date.now()): number | undefined {
  if (!h) return undefined;
  const s = h.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000);
  const t = Date.parse(s);
  if (Number.isNaN(t)) return undefined;
  return Math.max(0, t - now);
}

/** Codifica parámetros PostgREST (espacios como %20, acentos en UTF-8). Orden estable. */
export function buildQueryString(params: QueryParams): string {
  return Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]!)}`)
    .join('&');
}

interface CacheEntry {
  url: string;
  savedAt: string;
  status: number;
  contentRange: string | null;
  rows: Row[];
}

export class IndecClient {
  private readonly o: Required<Omit<ClientOptions, 'cacheDir' | 'log'>> & { cacheDir: string | null; log: (m: string) => void };
  private lastRequestAt = 0;
  /** Contadores de la sesión (para el resumen del log). */
  readonly stats = { requests: 0, retries: 0, cacheHits: 0 };

  constructor(opts: ClientOptions) {
    this.o = {
      baseUrl: opts.baseUrl.replace(/\/+$/, ''),
      token: opts.token,
      timeoutMs: opts.timeoutMs ?? 30000,
      maxRetries: opts.maxRetries ?? 4,
      minIntervalMs: opts.minIntervalMs ?? 250,
      pageSize: opts.pageSize ?? 1000,
      cacheDir: opts.cacheDir ?? null,
      cacheTtlHours: opts.cacheTtlHours ?? 0,
      useCache: opts.useCache ?? true,
      maxRetryAfterMs: opts.maxRetryAfterMs ?? 120000,
      backoffBaseMs: opts.backoffBaseMs ?? 500,
      fetchImpl: opts.fetchImpl ?? ((i, init) => fetch(i, init)),
      sleep: opts.sleep ?? defaultSleep,
      now: opts.now ?? (() => Date.now()),
      random: opts.random ?? Math.random,
      log: opts.log ?? (() => {}),
    };
    if (!this.o.token) throw new IngestError('config', 'Cliente INDEC sin token');
  }

  get pageSize(): number {
    return this.o.pageSize;
  }

  buildUrl(apiPath: string, params: QueryParams): string {
    const qs = buildQueryString(params);
    return `${this.o.baseUrl}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}${qs ? `?${qs}` : ''}`;
  }

  /** Una página (limit/offset). Usa caché si corresponde. */
  async getPage(apiPath: string, params: QueryParams, offset: number, limit = this.o.pageSize, useCache = this.o.useCache): Promise<PageResult> {
    const url = this.buildUrl(apiPath, { ...params, limit: String(limit), offset: String(offset) });
    if (useCache) {
      const hit = this.readCache(url);
      if (hit) {
        this.stats.cacheHits++;
        return { rows: hit.rows, range: parseContentRange(hit.contentRange), status: hit.status, url, fromCache: true };
      }
    }
    const res = await this.request(url);
    this.writeCache({ url, savedAt: new Date(this.o.now()).toISOString(), status: res.status, contentRange: res.contentRange, rows: res.rows });
    return { rows: res.rows, range: parseContentRange(res.contentRange), status: res.status, url, fromCache: false };
  }

  /**
   * Descarga todas las filas de una consulta paginando por la clave primaria completa.
   * Verifica Content-Range en cada página y el total al final.
   * Si una inconsistencia involucra páginas de caché, reintenta una vez sin caché.
   */
  async fetchAll(
    apiPath: string,
    params: QueryParams,
    order: string[],
    opts: { onPage?: (got: number, total: number) => void } = {},
  ): Promise<FetchAllResult> {
    try {
      return await this.fetchAllOnce(apiPath, params, order, this.o.useCache, opts);
    } catch (e) {
      if (e instanceof IngestError && e.kind === 'data' && this.o.useCache && (e as { fromCache?: boolean }).fromCache) {
        this.o.log(`  Inconsistencia con páginas en caché; se reintenta la consulta sin caché.`);
        return this.fetchAllOnce(apiPath, params, order, false, opts);
      }
      throw e;
    }
  }

  private async fetchAllOnce(
    apiPath: string,
    params: QueryParams,
    order: string[],
    useCache: boolean,
    opts: { onPage?: (got: number, total: number) => void },
  ): Promise<FetchAllResult> {
    if (!order.length) throw new IngestError('config', `Paginación sin orden para ${apiPath}: se requiere la clave primaria`);
    const q: QueryParams = { ...params, order: order.join(',') };
    const url = this.buildUrl(apiPath, q);
    const rows: Row[] = [];
    let total: number | null = null;
    let offset = 0;
    let pages = 0;
    let pagesFromCache = 0;
    const fail = (msg: string): never => {
      const err = new IngestError('data', `${msg} [${shortUrl(url)}]`);
      (err as { fromCache?: boolean }).fromCache = pagesFromCache > 0;
      throw err;
    };
    for (;;) {
      const page = await this.getPage(apiPath, q, offset, this.o.pageSize, useCache);
      pages++;
      if (page.fromCache) pagesFromCache++;
      const r = page.range;
      if (!r || r.total === null) fail(`Respuesta sin Content-Range con total (offset ${offset})`);
      if (total === null) total = r!.total!;
      else if (r!.total !== total) fail(`El total de filas cambió durante la paginación (${total} → ${r!.total}); posible publicación en curso`);
      if (page.rows.length > 0) {
        if (r!.start !== offset || r!.end === null || r!.end - r!.start + 1 !== page.rows.length) {
          fail(`Content-Range ${r!.start}-${r!.end}/${r!.total} inconsistente con offset ${offset} y ${page.rows.length} filas recibidas`);
        }
      }
      rows.push(...page.rows);
      offset += page.rows.length;
      opts.onPage?.(rows.length, total!);
      if (offset >= total!) break;
      if (page.rows.length === 0) fail(`Página vacía en offset ${offset} con total ${total}`);
    }
    if (rows.length !== total) fail(`Se recibieron ${rows.length} filas pero Content-Range informa ${total}`);
    return { rows, total: total!, pages, pagesFromCache, url };
  }

  // ------------------------------------------------------------ HTTP con reintentos

  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + this.o.minIntervalMs - this.o.now();
    if (wait > 0) await this.o.sleep(wait);
    this.lastRequestAt = this.o.now();
  }

  private backoff(attempt: number): number {
    const base = this.o.backoffBaseMs * 2 ** attempt;
    return Math.min(30000, Math.round(base + this.o.random() * base));
  }

  private async request(url: string): Promise<{ status: number; contentRange: string | null; rows: Row[] }> {
    let lastErr: IngestError | null = null;
    for (let attempt = 0; attempt <= this.o.maxRetries; attempt++) {
      await this.throttle();
      this.stats.requests++;
      let err: IngestError;
      try {
        const res = await this.o.fetchImpl(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.o.token}`, Accept: 'application/json', Prefer: 'count=exact' },
          signal: AbortSignal.timeout(this.o.timeoutMs),
        });
        if (res.status === 200 || res.status === 206) {
          let body: unknown;
          const txt = await res.text();
          try {
            body = JSON.parse(txt);
          } catch {
            throw new IngestError('data', `Respuesta no es JSON válido (${txt.length} bytes) [${shortUrl(url)}]`, { httpStatus: res.status });
          }
          if (!Array.isArray(body)) throw new IngestError('data', `Respuesta inesperada (se esperaba una lista de filas) [${shortUrl(url)}]`, { httpStatus: res.status });
          return { status: res.status, contentRange: res.headers.get('content-range'), rows: body as Row[] };
        }
        const { kind, retryable } = classifyHttpStatus(res.status);
        const detail = await safeErrorDetail(res);
        const hint = kind === 'auth' ? ' — token ausente, vencido o inválido (renovarlo en https://api.indec.gob.ar/)' : '';
        err = new IngestError(kind, `HTTP ${res.status}${detail ? `: ${detail}` : ''}${hint} [${shortUrl(url)}]`, {
          httpStatus: res.status,
          retryable,
          retryAfterMs: parseRetryAfter(res.headers.get('retry-after'), this.o.now()),
        });
      } catch (e) {
        if (e instanceof IngestError) {
          if (!e.retryable) throw e;
          err = e;
        } else {
          const name = (e as Error)?.name;
          const isTimeout = name === 'TimeoutError' || name === 'AbortError';
          err = new IngestError('network', `${isTimeout ? `Timeout (${this.o.timeoutMs} ms)` : `Error de red: ${(e as Error)?.message ?? String(e)}`} [${shortUrl(url)}]`, {
            retryable: true,
            cause: e,
          });
        }
      }
      lastErr = err;
      if (!err.retryable || attempt === this.o.maxRetries) break;
      // Retry-After es un piso, no un reemplazo del backoff: PostgREST responde
      // "Retry-After: 0" en 503 PGRST002 (caché de esquema caída), y respetarlo
      // literalmente agotaba los reintentos en milisegundos (corrida del 2026-11-11).
      const backoff = this.backoff(attempt);
      const delay = err.retryAfterMs !== undefined ? Math.max(backoff, Math.min(err.retryAfterMs, this.o.maxRetryAfterMs)) : backoff;
      this.stats.retries++;
      this.o.log(`  Reintento ${attempt + 1}/${this.o.maxRetries} en ${(delay / 1000).toFixed(1)} s (${err.message})`);
      await this.o.sleep(delay);
    }
    throw lastErr!;
  }

  // ------------------------------------------------------------ caché

  private cacheFile(url: string): string | null {
    if (!this.o.cacheDir || this.o.cacheTtlHours <= 0) return null;
    const h = crypto.createHash('sha256').update(url).digest('hex');
    return path.join(this.o.cacheDir, h.slice(0, 2), `${h}.json.gz`);
  }

  private readCache(url: string): CacheEntry | null {
    const f = this.cacheFile(url);
    if (!f) return null;
    try {
      const entry = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8')) as CacheEntry;
      if (entry.url !== url) return null;
      const age = this.o.now() - Date.parse(entry.savedAt);
      if (!(age >= 0 && age < this.o.cacheTtlHours * 3600_000)) return null;
      return entry;
    } catch {
      return null;
    }
  }

  private writeCache(entry: CacheEntry): void {
    const f = this.cacheFile(entry.url);
    if (!f) return;
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const tmp = `${f}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(entry)));
      fs.renameSync(tmp, f);
    } catch (e) {
      this.o.log(`  Aviso: no se pudo escribir la caché (${(e as Error).message})`);
    }
  }
}

/** Ruta + query decodificada para mensajes (sin host; nunca contiene credenciales). */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return redactSecrets(decodeURIComponent(`${u.pathname}${u.search}`));
  } catch {
    return redactSecrets(url);
  }
}

async function safeErrorDetail(res: Response): Promise<string> {
  try {
    const txt = (await res.text()).slice(0, 2000);
    try {
      const j = JSON.parse(txt) as { message?: string; code?: string; hint?: string };
      if (j && typeof j === 'object' && j.message) return redactSecrets(`${j.message}${j.code ? ` (código ${j.code})` : ''}${j.hint ? ` — ${j.hint}` : ''}`);
    } catch {
      /* no JSON */
    }
    return redactSecrets(txt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200));
  } catch {
    return '';
  }
}
