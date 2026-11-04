import type { MonetarySeries } from '@/monetary/types';

/** La fuente histórica se conserva en el store; se prefiere el cálculo vigente. */
export const MONETARY_CURRENT_ALTERNATIVES: Readonly<Record<number,string>> = {
  1229:'monetario.depositos.publicos.ARS', 1230:'monetario.vista.publicos.ARS',
  1231:'monetario.plazo.publicos.ARS', 1232:'monetario.m1.total',
  1233:'monetario.m2.total', 1234:'monetario.m3.total', 1239:'monetario.m2.privado',
};

export function selectableMonetarySeries(series: MonetarySeries[]): MonetarySeries[] {
  const usable = new Set(series.filter(s=>s.observations.some(o=>o.value!==null)).map(s=>s.def.id));
  const current = series.filter(s=>!usable.has(MONETARY_CURRENT_ALTERNATIVES[s.def.bcraId] ?? ''));
  const companions = new Set(current.map(s=>s.def.monthlyCompanionId).filter(Boolean));
  const daily = new Set(current.filter(s=>s.def.frequency==='D').map(s=>`${s.def.group}|${s.def.category}|${s.def.currency}|${s.def.sector}`));
  return current.filter(s=>!companions.has(s.def.id) && (s.def.frequency==='D' || !daily.has(`${s.def.group}|${s.def.category}|${s.def.currency}|${s.def.sector}`)));
}
