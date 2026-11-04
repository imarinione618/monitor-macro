/**
 * Errores de ingesta clasificados por tipo (ErrorKind del contrato compartido).
 * Los mensajes NUNCA incluyen el token: las URLs que se informan no lo llevan
 * (la autenticación viaja solo en el header Authorization).
 */
import type { ErrorKind } from '../core/types';

export class IngestError extends Error {
  readonly kind: ErrorKind;
  readonly httpStatus?: number;
  /** true si tiene sentido reintentar (5xx, 429, red, timeout). */
  readonly retryable: boolean;
  /** Segundos sugeridos por el servidor (Retry-After), si los informó. */
  readonly retryAfterMs?: number;

  constructor(
    kind: ErrorKind,
    message: string,
    opts: { httpStatus?: number; retryable?: boolean; retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(redactSecrets(message));
    this.name = 'IngestError';
    this.kind = kind;
    this.httpStatus = opts.httpStatus;
    this.retryable = opts.retryable ?? false;
    this.retryAfterMs = opts.retryAfterMs;
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}

/** Elimina cualquier cosa con forma de JWT o "Bearer ..." de un texto. */
export function redactSecrets(s: string): string {
  return s
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [oculto]')
    .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[token oculto]');
}

export function toIngestError(e: unknown): IngestError {
  if (e instanceof IngestError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  return new IngestError('unknown', msg, { cause: e });
}

/** Clasifica un status HTTP de error. */
export function classifyHttpStatus(status: number): { kind: ErrorKind; retryable: boolean } {
  if (status === 401 || status === 403) return { kind: 'auth', retryable: false };
  if (status === 429) return { kind: 'rate_limit', retryable: true };
  if (status === 404) return { kind: 'config', retryable: false };
  if (status === 408) return { kind: 'network', retryable: true };
  if (status >= 500) return { kind: 'server', retryable: true };
  if (status >= 400) return { kind: 'data', retryable: false };
  return { kind: 'unknown', retryable: false };
}

export const ERROR_KIND_LABELS: Record<ErrorKind, string> = {
  auth: 'autenticación',
  rate_limit: 'límite de solicitudes',
  data: 'datos',
  network: 'red',
  server: 'servidor',
  config: 'configuración',
  unknown: 'desconocido',
};
