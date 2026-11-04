import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeJsonAtomic } from '../core/store';
import type { BcraMetadata, MonetaryObservation } from './types';

export const BCRA_BASE_URL = 'https://api.bcra.gob.ar/estadisticas/v4.0';
type ApiBody = { status: number; metadata?: { resultset: { count: number; offset: number; limit: number } }; results: unknown[]; errorMessages?: string[] };
export interface BcraClientOptions { fetch?: typeof fetch; cacheDir?: string | null; cacheTtlMs?: number; retries?: number; timeoutMs?: number; now?: () => number }

export function validDate(date: unknown): date is string {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}

export function normalizeBcraObservations(rows: unknown[], scale = 1): MonetaryObservation[] {
  const seen = new Map<string, number | null>();
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') throw new Error('Observación BCRA inválida');
    const { fecha, valor } = raw as { fecha?: unknown; valor?: unknown };
    if (!validDate(fecha)) throw new Error(`Fecha BCRA inválida: ${String(fecha)}`);
    if (valor !== null && (typeof valor !== 'number' || !Number.isFinite(valor))) throw new Error(`Valor BCRA inválido en ${fecha}`);
    const value = valor === null ? null : valor * scale;
    if (seen.has(fecha)) throw new Error(`Fecha duplicada BCRA: ${fecha}`);
    seen.set(fecha, value);
  }
  return [...seen].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

export class BcraClient {
  private options: BcraClientOptions;
  constructor(options: BcraClientOptions = {}) { this.options = options; }

  private async request(endpoint: string, fresh: boolean): Promise<ApiBody> {
    const url = `${BCRA_BASE_URL}/${endpoint}`;
    const cacheDir = this.options.cacheDir === undefined ? 'data/cache/bcra' : this.options.cacheDir;
    const file = cacheDir ? path.join(cacheDir, `${crypto.createHash('sha256').update(url).digest('hex')}.json`) : null;
    const now = this.options.now ?? Date.now;
    if (file && !fresh) {
      try {
        const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (now() - cached.savedAt < (this.options.cacheTtlMs ?? 6 * 3600_000) && cached.body?.status === 200) return cached.body;
      } catch { /* Un caché ausente o corrupto se vuelve a consultar. */ }
    }
    let lastError: unknown;
    for (let attempt = 0; attempt <= (this.options.retries ?? 3); attempt++) {
      try {
        const response = await (this.options.fetch ?? fetch)(url, { headers: { 'Accept-Language': 'es-AR' }, signal: AbortSignal.timeout(this.options.timeoutMs ?? 45_000) });
        if (!response.ok) throw new Error(`BCRA HTTP ${response.status}`);
        const body = await response.json() as ApiBody;
        if (body.status !== 200 || !Array.isArray(body.results)) throw new Error(`Respuesta BCRA inválida: ${body.status}`);
        if (file) writeJsonAtomic(file, { savedAt: now(), body });
        return body;
      } catch (error) {
        lastError = error;
        if (attempt < (this.options.retries ?? 3)) await new Promise(resolve => setTimeout(resolve, Math.min(500 * 2 ** attempt, 4000)));
      }
    }
    throw lastError;
  }

  async catalog(fresh = false): Promise<BcraMetadata[]> {
    const rows: BcraMetadata[] = [];
    let expected: number | undefined;
    for (let offset = 0; ; offset += 3000) {
      const body = await this.request(`monetarias?limit=3000&offset=${offset}`, fresh);
      const count = body.metadata?.resultset.count;
      if (!Number.isInteger(count) || count! < 0 || (expected !== undefined && count !== expected)) throw new Error('Paginación del catálogo BCRA inconsistente');
      expected = count;
      rows.push(...body.results as BcraMetadata[]);
      if (rows.length === count) break;
      if (!body.results.length || rows.length > count!) throw new Error('Catálogo BCRA truncado');
    }
    const ids = new Set(rows.map(row => row.idVariable));
    if (ids.size !== rows.length || rows.some(row => !Number.isInteger(row.idVariable) || !row.descripcion || !row.unidadExpresion || !validDate(row.primerFechaInformada) || !validDate(row.ultFechaInformada))) throw new Error('Metadatos BCRA inválidos');
    return rows;
  }

  async observations(id: number, from: string, to: string, scale = 1, fresh = false): Promise<MonetaryObservation[]> {
    if (!validDate(from) || !validDate(to) || from > to) throw new Error('Rango de fechas BCRA inválido');
    const rows: unknown[] = [];
    let expected: number | undefined;
    for (let offset = 0; ; offset += 3000) {
      const body = await this.request(`monetarias/${id}?desde=${from}&hasta=${to}&limit=3000&offset=${offset}`, fresh);
      const count = body.metadata?.resultset.count;
      if (!Number.isInteger(count) || count! < 0 || (expected !== undefined && count !== expected)) throw new Error(`Paginación BCRA ${id} inconsistente`);
      expected = count;
      const series = body.results as { idVariable: number; detalle: unknown[] }[];
      if (series.some(s => s.idVariable !== id || !Array.isArray(s.detalle)) || series.length > 1) throw new Error(`ID BCRA inesperado para ${id}`);
      const page = series.flatMap(s => s.detalle);
      rows.push(...page);
      if (rows.length === count) break;
      if (!page.length || rows.length > count!) throw new Error(`Serie BCRA ${id} truncada`);
    }
    const observations = normalizeBcraObservations(rows, scale);
    if (observations.some(p => p.date < from || p.date > to)) throw new Error('BCRA devolvió fechas fuera del rango solicitado');
    return observations;
  }
}
