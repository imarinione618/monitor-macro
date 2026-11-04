/**
 * Textos de fuente, notas y avisos que acompañan a cada gráfico (pantalla y exportación).
 */
import { formatPeriodShort } from '@/core/periods';
import type { TransformId } from '@/core/types';
import { formatDateTimeAR } from './format';
import type { ClientSeries, SourceRef } from './types';

export function uniqueSources(series: ClientSeries[]): SourceRef[] {
  const seen = new Map<string, SourceRef>();
  for (const s of series) for (const src of s.sources) if (!seen.has(src.title)) seen.set(src.title, src);
  return [...seen.values()];
}

/** Última fecha de consulta (retrievedAt) entre las series. */
export function latestRetrieved(series: ClientSeries[]): string | null {
  const xs = series.map((s) => s.retrievedAt).filter((x): x is string => !!x).sort();
  return xs[xs.length - 1] ?? null;
}

/**
 * "Fuente: INDEC, EMAE — Nivel general. Elaboración propia (transformación sobre datos oficiales).
 *  Datos consultados el 04/11/2026 10:02."
 */
export function buildSourceLine(series: ClientSeries[], transform: TransformId): string {
  const titles = uniqueSources(series).map((s) => s.title);
  const derived = series.some((s) => s.def.source.kind === 'derived');
  const parts = [`Fuente: INDEC${titles.length ? `, ${titles.join('; ')}` : ''} (API Catálogo INDEC).`];
  if (derived || transform !== 'level') parts.push('Elaboración propia sobre datos oficiales.');
  const r = latestRetrieved(series);
  if (r) parts.push(`Datos consultados el ${formatDateTimeAR(r)} (hora de Buenos Aires).`);
  return parts.join(' ');
}

/** Notas metodológicas únicas de las series (y cobertura geográfica cuando no es total país). */
export function collectNotes(series: ClientSeries[], extra: string[] = []): string[] {
  const out: string[] = [];
  const add = (n: string | undefined) => {
    if (n && !out.includes(n)) out.push(n);
  };
  extra.forEach(add);
  for (const s of series) {
    if (s.def.coverage) add(`Cobertura: ${s.def.coverage}`);
    s.def.notes?.forEach(add);
    if (s.def.currency) add(`Valores en ${s.def.currency}.`);
  }
  return out;
}

export interface SeriesNotice {
  kind: 'stale' | 'missing' | 'error' | 'suppressed';
  text: string;
}

/** Avisos de estado por serie: datos conservados (stale), faltantes, errores, supresión "s". */
export function seriesNotices(series: ClientSeries[]): SeriesNotice[] {
  const out: SeriesNotice[] = [];
  for (const s of series) {
    if (s.missing) out.push({ kind: 'missing', text: `${s.def.shortName}: sin datos en el store.` });
    if (s.stale)
      out.push({
        kind: 'stale',
        text: `${s.def.shortName}: se muestran datos conservados de una actualización anterior${s.retrievedAt ? ` (consultados el ${formatDateTimeAR(s.retrievedAt)})` : ''}; la última actualización falló.`,
      });
    if (s.error) out.push({ kind: 'error', text: `${s.def.shortName}: ${s.error}` });
  }
  // Supresión "s": un solo aviso para todas las series (evita repetir el mismo texto).
  const sup = series.filter((s) => s.suppressedRows && s.suppressedRows > 0);
  if (sup.length)
    out.push({
      kind: 'suppressed',
      text: `Celdas por país con secreto estadístico ("s"), publicadas sin valor (no se tratan como cero): ${sup
        .map((s) => `${s.def.shortName} ${s.suppressedRows!.toLocaleString('es-AR')}`)
        .join(' · ')}. Su monto se publica agregado en el código "Confidencial": los totales lo incluyen, las aperturas por rubro y por país no. Ver notas metodológicas.`,
    });
  return out;
}

/** "EMAE desest.: ago-26 · IPI manuf.: jul-26" (último período publicado de cada serie). */
export function lastPeriodsLine(series: ClientSeries[]): string {
  return series
    .filter((s) => s.lastPeriod)
    .map((s) => `${s.def.shortName}: ${formatPeriodShort(s.lastPeriod!)}`)
    .join(' · ');
}
