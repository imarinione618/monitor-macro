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

/** Une organismos: «INDEC», «INDEC y BCRA», «INDEC, BCRA y A3 Mercados». */
export function joinOrgs(orgs: string[]): string {
  const u = [...new Set(orgs.filter(Boolean))];
  return u.length <= 1 ? (u[0] ?? '') : `${u.slice(0, -1).join(', ')} y ${u.at(-1)}`;
}

/** Formato único de fuente de los gráficos: «Fuente: one618 en base a <organismos>.» */
export function sourceLineFor(orgs: string[]): string {
  return `Fuente: one618 en base a ${joinOrgs(orgs) || 'datos oficiales'}.`;
}

export function buildSourceLine(series: ClientSeries[], _transform?: TransformId, extraOrgs: string[] = []): string {
  return sourceLineFor([...uniqueSources(series).map((s) => s.org), ...extraOrgs]);
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
