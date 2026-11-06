/**
 * Agregados monetarios (BM, M1, M2, M3) como % del PIB a precios corrientes.
 *
 *  - Oficial (línea continua): promedio de los saldos diarios publicados en el trimestre ÷
 *    PIB corriente promedio de los últimos 4 trimestres (= PIB anual móvil; el INDEC publica
 *    niveles trimestrales anualizados, por eso se promedian y no se suman) × 100.
 *    Requiere los 4 trimestres de PIB; trimestre de saldos incompleto → no se publica como oficial.
 *  - Estimado (línea punteada): trimestres posteriores al último PIB publicado; numerador =
 *    promedio de los saldos disponibles en ese trimestre (el último puede estar en curso),
 *    denominador = último PIB anual móvil disponible. Se reemplaza al publicarse el PIB.
 */
import type { Observation } from '@/core/types';
import { shiftPeriod } from '@/core/periods';
import type { MonetarySeries } from '@/monetary/types';

export interface AggregateGdpPoint { period: string; value: number | null; estimated: boolean; days: number; lastDate: string | null; partial: boolean }
export interface AggregateGdpColumn { id: string; label: string; points: AggregateGdpPoint[] }
export interface AggregateGdpModel { periods: string[]; columns: AggregateGdpColumn[]; lastGdpPeriod: string | null; methodology: string }

export const AGGREGATE_GDP_SOURCES = [
  { id: 'monetario.bcra.15', label: 'Base monetaria' },
  { id: 'monetario.m1.total', label: 'M1' },
  { id: 'monetario.m2.total', label: 'M2' },
  { id: 'monetario.m3.total', label: 'M3' },
] as const;

export function quarterOf(date: string): string {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

/** Último día hábil (lunes a viernes) del trimestre: criterio conservador sin calendario de feriados. */
function quarterEnd(period: string): string {
  const [y, q] = [Number(period.slice(0, 4)), Number(period.slice(6))];
  const end = new Date(Date.UTC(y, q * 3, 0));
  while ([0, 6].includes(end.getUTCDay())) end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

/** PIB anual móvil: promedio de los niveles anualizados de t, t−1, t−2, t−3. Null si falta alguno. */
export function gdpAnnualRolling(gdp: Observation[]): Map<string, number> {
  const m = new Map(gdp.filter((o) => o.value !== null).map((o) => [o.period, o.value as number]));
  const out = new Map<string, number>();
  for (const p of m.keys()) {
    const vals = [0, 1, 2, 3].map((k) => m.get(shiftPeriod(p, -k)));
    if (vals.every((v) => v !== undefined)) out.set(p, (vals as number[]).reduce((a, b) => a + b, 0) / 4);
  }
  return out;
}

export function buildAggregatesGdp(series: MonetarySeries[], gdp: Observation[], asOf: string): AggregateGdpModel {
  const rolling = gdpAnnualRolling(gdp);
  const gdpPeriods = [...rolling.keys()].sort();
  const lastGdpPeriod = gdpPeriods.at(-1) ?? null;
  const lastGdp = lastGdpPeriod ? rolling.get(lastGdpPeriod)! : null;
  const columns: AggregateGdpColumn[] = AGGREGATE_GDP_SOURCES.flatMap(({ id, label }) => {
    const s = series.find((x) => x.def.id === id);
    if (!s) return [];
    const byQ = new Map<string, { sum: number; n: number; last: string }>();
    for (const o of s.observations) {
      if (o.value === null || o.date > asOf) continue;
      const q = quarterOf(o.date);
      const acc = byQ.get(q) ?? { sum: 0, n: 0, last: o.date };
      acc.sum += o.value; acc.n++; if (o.date > acc.last) acc.last = o.date;
      byQ.set(q, acc);
    }
    const lastDate = [...byQ.values()].map((x) => x.last).sort().at(-1) ?? '';
    const points: AggregateGdpPoint[] = [...byQ.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([q, acc]): AggregateGdpPoint[] => {
      // Solo el último trimestre con datos puede estar en curso (los anteriores pueden terminar antes por feriados).
      const partial = q === quarterOf(lastDate) && lastDate < quarterEnd(q);
      const avg = acc.sum / acc.n;
      const official = rolling.get(q);
      if (official !== undefined && !partial) return [{ period: q, value: (avg / official) * 100, estimated: false, days: acc.n, lastDate: acc.last, partial }];
      if (lastGdpPeriod && lastGdp && q > lastGdpPeriod) return [{ period: q, value: (avg / lastGdp) * 100, estimated: true, days: acc.n, lastDate: acc.last, partial }];
      return [];
    });
    return [{ id, label, points }];
  });
  const periods = [...new Set(columns.flatMap((c) => c.points.map((p) => p.period)))].sort();
  const methodology = `Promedio trimestral de saldos diarios publicados por el BCRA ÷ PIB a precios corrientes promedio de los últimos 4 trimestres (INDEC; niveles trimestrales anualizados) × 100. Línea punteada: estimación para los trimestres posteriores al último PIB publicado${lastGdpPeriod ? ` (${lastGdpPeriod.replace('-Q', ' T')})` : ''}, con el promedio de los saldos disponibles en el trimestre sobre ese último PIB anual móvil; el trimestre en curso es parcial. M1, M2 y M3: cálculos propios con componentes de la API BCRA.`;
  return { periods, columns, lastGdpPeriod, methodology };
}
