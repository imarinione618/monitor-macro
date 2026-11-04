/**
 * Detección de revisiones comparando la serie nueva contra la almacenada.
 *
 * La API de INDEC NO expone fecha de publicación ni versión de los datos: la única
 * forma de detectar revisiones es comparar valores entre corridas.
 *
 *  - 'revised'          período presente en ambas con valor distinto (tolerancia relativa 1e-9),
 *                       o que pasó de número a null o viceversa.
 *  - 'added_historical' período nuevo DENTRO del rango ya almacenado (no al final).
 *  - 'removed'          período almacenado que ya no aparece.
 *  - Los períodos nuevos posteriores al último almacenado NO son revisiones
 *    (es la publicación normal del dato del mes/trimestre).
 *  - Si no había datos almacenados (primera corrida) no hay revisiones.
 */
import type { Observation, Period, RevisionRecord } from '../core/types';
import { comparePeriods } from '../core/periods';

export const REVISION_REL_TOL = 1e-9;

export function sameValue(a: number | null, b: number | null, tol = REVISION_REL_TOL): boolean {
  if (a === null || b === null) return a === b;
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= tol * scale || Math.abs(a - b) < 1e-12;
}

export function detectRevisions(
  seriesId: string,
  oldObs: Observation[] | null | undefined,
  newObs: Observation[],
  ctx: { runId: string; detectedAt: string; scopeFrom?: Period },
): RevisionRecord[] {
  if (!oldObs || !oldObs.length) return [];
  const inScope = (p: Period) => !ctx.scopeFrom || comparePeriods(p, ctx.scopeFrom) >= 0;
  const oldMap = new Map(oldObs.map((o) => [o.period, o.value]));
  const newMap = new Map(newObs.map((o) => [o.period, o.value]));
  const oldLast = oldObs[oldObs.length - 1]!.period;
  const out: RevisionRecord[] = [];
  const rec = (period: Period, oldValue: number | null, newValue: number | null, kind: RevisionRecord['kind']) =>
    out.push({ seriesId, period, oldValue, newValue, detectedAt: ctx.detectedAt, runId: ctx.runId, kind });

  for (const o of newObs) {
    if (!inScope(o.period)) continue;
    if (oldMap.has(o.period)) {
      const ov = oldMap.get(o.period)!;
      if (!sameValue(ov, o.value)) rec(o.period, ov, o.value, 'revised');
    } else if (comparePeriods(o.period, oldLast) <= 0) {
      rec(o.period, null, o.value, 'added_historical');
    }
  }
  for (const o of oldObs) {
    if (!inScope(o.period)) continue;
    if (!newMap.has(o.period)) rec(o.period, o.value, null, 'removed');
  }
  return out.sort((a, b) => comparePeriods(a.period, b.period));
}

/** Fusiona lo almacenado (antes de la ventana) con lo descargado (desde la ventana). */
export function mergeWindow(oldObs: Observation[] | null | undefined, windowObs: Observation[], windowStart: Period): Observation[] {
  const before = (oldObs ?? []).filter((o) => comparePeriods(o.period, windowStart) < 0);
  const after = windowObs.filter((o) => comparePeriods(o.period, windowStart) >= 0);
  return [...before, ...after];
}

/** Cantidad de períodos posteriores al último almacenado (publicación normal de datos nuevos). */
export function countNewPeriods(oldObs: Observation[] | null | undefined, newObs: Observation[]): number {
  if (!oldObs || !oldObs.length) return newObs.length;
  const last = oldObs[oldObs.length - 1]!.period;
  return newObs.filter((o) => comparePeriods(o.period, last) > 0).length;
}
