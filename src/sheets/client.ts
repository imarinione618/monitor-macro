/**
 * Implementación REAL de `SheetsApi` sobre googleapis, con reintentos y backoff
 * exponencial (+ jitter, respeta Retry-After) ante 429 / 5xx / errores de red.
 *
 * Nunca se loguean tokens: los errores se reducen a status + mensaje saneado
 * (los errores de gaxios incluyen la config del request, con el header Authorization).
 *
 * googleapis se importa en forma diferida para que `--dry-run` y los tests no lo carguen.
 */
import type { sheets_v4 } from 'googleapis';
import type {
  CellValue,
  Grid,
  SheetInfo,
  SheetsApi,
  SheetsRequest,
  SheetsResponse,
  SpreadsheetInfo,
  ValueRangeWrite,
} from './types';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: { attempt: number; delayMs: number; status: number | null; message: string }) => void;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE', 'UND_ERR_SOCKET']);

interface ErrLike {
  code?: string | number;
  status?: number;
  message?: string;
  response?: { status?: number; headers?: Record<string, string> | { get?: (k: string) => string | null } };
}

export function errorStatus(e: unknown): number | null {
  const x = e as ErrLike;
  const s = x?.response?.status ?? x?.status ?? (typeof x?.code === 'number' ? x.code : Number(x?.code));
  return Number.isFinite(s) && (s as number) >= 100 ? (s as number) : null;
}

/** Mensaje de error sin secretos (sin headers, tokens ni query strings de auth). */
export function sanitizeError(e: unknown): string {
  const x = e as ErrLike;
  let msg = typeof x?.message === 'string' ? x.message : String(e);
  msg = msg
    .replace(/Bearer\s+[A-Za-z0-9._\-~+/]+=*/gi, 'Bearer ***')
    .replace(/(access_token|refresh_token|client_secret|id_token)=([^&\s"]+)/gi, '$1=***')
    .replace(/"(access_token|refresh_token|client_secret|private_key|id_token)"\s*:\s*"[^"]*"/gi, '"$1":"***"')
    .replace(/ya29\.[A-Za-z0-9._\-]+/g, 'ya29.***')
    .replace(/1\/\/[A-Za-z0-9._\-]{20,}/g, '1//***');
  const status = errorStatus(e);
  return status ? `HTTP ${status}: ${msg}` : msg;
}

function retryAfterMs(e: unknown): number | null {
  const h = (e as ErrLike)?.response?.headers;
  if (!h) return null;
  const v = typeof (h as { get?: unknown }).get === 'function' ? (h as { get: (k: string) => string | null }).get('retry-after') : (h as Record<string, string>)['retry-after'];
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n)) return n * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.max(0, t - Date.now()) : null;
}

export function isRetryable(e: unknown): boolean {
  const s = errorStatus(e);
  if (s !== null) return RETRYABLE_STATUS.has(s);
  const code = (e as ErrLike)?.code;
  return typeof code === 'string' && RETRYABLE_CODES.has(code);
}

/** Ejecuta `fn` con reintentos ante errores transitorios. Lanza un Error saneado si se agotan. */
export async function withRetry<T>(label: string, fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxRetries = opts.maxRetries ?? 6;
  const base = opts.baseDelayMs ?? 1000;
  const maxDelay = opts.maxDelayMs ?? 64000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isRetryable(e) || attempt >= maxRetries) {
        const err = new Error(`${label}: ${sanitizeError(e)}`);
        (err as Error & { status?: number | null }).status = errorStatus(e);
        throw err;
      }
      const backoff = Math.min(maxDelay, base * 2 ** attempt) * (0.5 + Math.random() * 0.5);
      const delayMs = Math.max(backoff, retryAfterMs(e) ?? 0);
      opts.onRetry?.({ attempt: attempt + 1, delayMs, status: errorStatus(e), message: sanitizeError(e) });
      await sleep(delayMs);
    }
  }
}

const SPREADSHEET_FIELDS =
  'spreadsheetId,spreadsheetUrl,properties(title,locale,timeZone),developerMetadata(metadataId,metadataKey,metadataValue),' +
  'sheets(properties(sheetId,title,index,gridProperties),charts(chartId),developerMetadata(metadataId,metadataKey,metadataValue))';

/** Crea la implementación real a partir de un cliente de auth de google-auth-library. */
export async function createGoogleSheetsApi(auth: unknown, retry: RetryOptions = {}): Promise<SheetsApi> {
  const { google } = await import('googleapis');
  const sheets = google.sheets({ version: 'v4', auth: auth as never });
  const drive = google.drive({ version: 'v3', auth: auth as never });
  const r = <T>(label: string, fn: () => Promise<T>) => withRetry(label, fn, retry);

  const toInfo = (s: sheets_v4.Schema$Spreadsheet): SpreadsheetInfo => ({
    spreadsheetId: s.spreadsheetId!,
    title: s.properties?.title ?? '',
    locale: s.properties?.locale ?? null,
    timeZone: s.properties?.timeZone ?? null,
    url: s.spreadsheetUrl ?? null,
    developerMetadata: (s.developerMetadata ?? []).map((m) => ({
      metadataId: m.metadataId ?? null,
      metadataKey: m.metadataKey ?? '',
      metadataValue: m.metadataValue ?? '',
    })),
    sheets: (s.sheets ?? []).map(
      (sh): SheetInfo => ({
        sheetId: sh.properties?.sheetId ?? 0,
        title: sh.properties?.title ?? '',
        index: sh.properties?.index ?? 0,
        rowCount: sh.properties?.gridProperties?.rowCount ?? 0,
        columnCount: sh.properties?.gridProperties?.columnCount ?? 0,
        frozenRowCount: sh.properties?.gridProperties?.frozenRowCount ?? 0,
        frozenColumnCount: sh.properties?.gridProperties?.frozenColumnCount ?? 0,
        developerMetadata: (sh.developerMetadata ?? []).map((m) => ({
          metadataId: m.metadataId ?? null,
          metadataKey: m.metadataKey ?? '',
          metadataValue: m.metadataValue ?? '',
        })),
        chartIds: (sh.charts ?? []).map((c) => c.chartId!).filter((x) => x !== undefined && x !== null),
      }),
    ),
  });

  return {
    async createSpreadsheet(input) {
      const res = await r('spreadsheets.create', () =>
        sheets.spreadsheets.create({
          requestBody: {
            properties: { title: input.title, locale: input.locale, timeZone: input.timeZone },
            sheets: [{ properties: { sheetId: input.firstSheet.sheetId, title: input.firstSheet.title } }],
          },
          fields: 'spreadsheetId,spreadsheetUrl',
        }),
      );
      return { spreadsheetId: res.data.spreadsheetId!, url: res.data.spreadsheetUrl ?? null };
    },

    async getSpreadsheet(spreadsheetId) {
      const res = await r('spreadsheets.get', () =>
        sheets.spreadsheets.get({ spreadsheetId, includeGridData: false, fields: SPREADSHEET_FIELDS }),
      );
      return toInfo(res.data);
    },

    async batchUpdate(spreadsheetId, requests: SheetsRequest[]): Promise<SheetsResponse[]> {
      const res = await r('spreadsheets.batchUpdate', () =>
        sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests, includeSpreadsheetInResponse: false } }),
      );
      return res.data.replies ?? [];
    },

    async valuesBatchGet(spreadsheetId, ranges): Promise<Grid[]> {
      const res = await r('values.batchGet', () =>
        sheets.spreadsheets.values.batchGet({
          spreadsheetId,
          ranges,
          valueRenderOption: 'UNFORMATTED_VALUE',
          dateTimeRenderOption: 'SERIAL_NUMBER',
          majorDimension: 'ROWS',
        }),
      );
      return (res.data.valueRanges ?? []).map((vr) => (vr.values ?? []) as CellValue[][]);
    },

    async valuesBatchUpdate(spreadsheetId, data: ValueRangeWrite[]) {
      await r('values.batchUpdate', () =>
        sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { valueInputOption: 'RAW', includeValuesInResponse: false, data },
        }),
      );
    },

    async valuesBatchClear(spreadsheetId, ranges) {
      await r('values.batchClear', () => sheets.spreadsheets.values.batchClear({ spreadsheetId, requestBody: { ranges } }));
    },

    async isTrashed(spreadsheetId) {
      try {
        const res = await r('drive.files.get', () => drive.files.get({ fileId: spreadsheetId, fields: 'trashed', supportsAllDrives: true }));
        return res.data.trashed ?? null;
      } catch {
        // Con drive.file solo se ven archivos creados/abiertos por la app: si no, no se sabe.
        return null;
      }
    },
  };
}
