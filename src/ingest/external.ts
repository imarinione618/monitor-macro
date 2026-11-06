/**
 * Descarga y normalización de fuentes externas (src/core/feeds.ts) → observaciones por clave.
 * Los parsers son estrictos: si cambia el formato, fallan con un error claro (no devuelven datos parciales).
 */
import { FEEDS, type FeedConfig } from '../core/feeds';
import { makePeriod } from '../core/periods';
import type { Frequency, Observation, Period } from '../core/types';
import { IngestError } from './errors';

export interface FeedData {
  feed: string;
  url: string;
  retrievedAt: string;
  series: Record<string, Observation[]>;
}

export type FeedLoader = (feed: FeedConfig, opts: { fetch: typeof fetch; now: () => Date }) => Promise<FeedData>;

/** 'YYYY-MM-DD' (primer día del período) → período canónico según frecuencia. */
export function periodFromIndex(date: string, frequency: Frequency): Period {
  const m = /^(\d{4})-(\d{2})-01$/.exec(date.trim());
  if (!m) throw new IngestError('data', `indice_tiempo inválido: "${date}"`);
  const year = Number(m[1]), month = Number(m[2]);
  if (month < 1 || month > 12) throw new IngestError('data', `mes inválido en indice_tiempo: "${date}"`);
  if (frequency === 'M') return makePeriod(year, month, 'M');
  if (frequency === 'Q') {
    if ((month - 1) % 3 !== 0) throw new IngestError('data', `indice_tiempo trimestral no alineado: "${date}"`);
    return makePeriod(year, (month - 1) / 3 + 1, 'Q');
  }
  if (frequency === 'A' && month === 1) return makePeriod(year, 1, 'A');
  throw new IngestError('data', `frecuencia no soportada para indice_tiempo "${date}"`);
}

/** CSV simple de datos.gob.ar: coma, sin comillas en datos numéricos; primera columna indice_tiempo. */
export function parseSspmCsv(text: string, frequency: Frequency): Record<string, Observation[]> {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new IngestError('data', 'CSV vacío');
  const header = lines[0]!.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  if (header[0] !== 'indice_tiempo') throw new IngestError('data', `CSV sin columna indice_tiempo (encabezado: ${header.slice(0, 3).join(',')})`);
  const out: Record<string, Observation[]> = Object.fromEntries(header.slice(1).map((h) => [h, []]));
  const seen = new Set<string>();
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    if (cells.length !== header.length) throw new IngestError('data', `fila con ${cells.length} columnas (se esperaban ${header.length}): ${line.slice(0, 80)}`);
    const period = periodFromIndex(cells[0]!, frequency);
    if (seen.has(period)) throw new IngestError('data', `período duplicado en CSV: ${period}`);
    seen.add(period);
    header.slice(1).forEach((h, i) => {
      const raw = cells[i + 1]!.trim();
      let value: number | null = null;
      if (raw !== '' && raw.toLowerCase() !== 'nan' && raw.toLowerCase() !== 'null') {
        value = Number(raw);
        if (!Number.isFinite(value)) throw new IngestError('data', `valor no numérico en ${h} ${period}: "${raw}"`);
      }
      out[h]!.push({ period, value });
    });
  }
  for (const obs of Object.values(out)) obs.sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
  return out;
}

async function fetchText(url: string, fetcher: typeof fetch): Promise<string> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetcher(url, { signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new IngestError(res.status >= 500 ? 'server' : 'network', `HTTP ${res.status} al descargar ${url}`, { httpStatus: res.status });
      return await res.text();
    } catch (e) {
      last = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw last instanceof IngestError ? last : new IngestError('network', `No se pudo descargar ${url}: ${(last as Error)?.message ?? last}`);
}

const sspmLoader: FeedLoader = async (feed, { fetch: fetcher, now }) => {
  const text = await fetchText(feed.url, fetcher);
  return { feed: feed.id, url: feed.url, retrievedAt: now().toISOString(), series: parseSspmCsv(text, feed.frequency) };
};

const idecbaLoader: FeedLoader = async (feed, { fetch: fetcher, now }) => {
  // Módulo opcional: se carga solo si hay series IDECBA en el registro.
  const mod = (await import(/* @vite-ignore */ '../external/idecba')) as typeof import('../external/idecba');
  const res = feed.kind === 'idecba_ipcba' ? await mod.fetchIpcba({ fetch: fetcher, now }) : await mod.fetchRestaurantes({ fetch: fetcher, now });
  return { feed: feed.id, url: res.sourceUrl, retrievedAt: res.retrievedAt, series: res.series };
};

export const DEFAULT_LOADERS: Record<FeedConfig['kind'], FeedLoader> = {
  sspm_csv: sspmLoader,
  idecba_ipcba: idecbaLoader,
  idecba_restaurantes: idecbaLoader,
};

export function feedConfig(id: string): FeedConfig {
  const f = FEEDS[id];
  if (!f) throw new IngestError('config', `Feed desconocido: ${id}`);
  return f;
}
