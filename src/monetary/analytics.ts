import type { MonetaryDef, MonetaryObservation, MonetarySeries } from './types';

export interface MonetaryPoint {
  period: string; value: number | null; effectiveDate: string; partial: boolean; coverageCount: number;
}
export interface MonetaryOptions {
  frequency: 'D' | 'M'; monthlyMode: 'mean' | 'close'; valueMode: 'nominal' | 'real';
  transform: 'level' | 'pct_mom' | 'pct_yoy' | 'absolute_mom' | 'change_pp' | 'change_bp' | 'base100';
  basePeriod?: string; asOf?: string; from?: string; to?: string;
}
export interface IpcPoint { period: string; value: number | null }
const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const today = () => new Date().toISOString().slice(0, 10);

/** Promedio de observaciones publicadas, sin completar fines de semana ni huecos. */
export function aggregateMonthly(observations: MonetaryObservation[], mode: 'mean' | 'close', asOf = today()): MonetaryPoint[] {
  const groups = new Map<string, MonetaryObservation[]>();
  const lastPublished = observations.filter(o=>o.date <= asOf && finite(o.value)).map(o=>o.date).sort().at(-1);
  for (const o of observations) {
    if (o.date > asOf) continue;
    const month = o.date.slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), o]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([period, rows]) => {
    const valid = rows.filter(o => finite(o.value)).sort((a, b) => a.date.localeCompare(b.date));
    const last = valid.at(-1);
    const [year, month] = period.split('-').map(Number);
    const end = new Date(Date.UTC(year!, month!, 0));
    while ([0,6].includes(end.getUTCDay())) end.setUTCDate(end.getUTCDate()-1);
    // Criterio conservador: sin calendario de feriados, no certificar el último mes
    // si la fuente todavía no llega al último día lunes-viernes del mes.
    const incompleteTail = lastPublished?.slice(0,7) === period && lastPublished < end.toISOString().slice(0,10);
    return { period, value: !last ? null : mode === 'close' ? last.value : valid.reduce((s, o) => s + o.value!, 0) / valid.length,
      effectiveDate: last?.date ?? rows.at(-1)!.date, coverageCount: valid.length, partial: period >= asOf.slice(0, 7) || incompleteTail || rows.some(o=>!finite(o.value)) };
  });
}

function shiftMonth(period: string, months: number): string {
  const [year, month, day] = period.split('-').map(Number);
  const d = new Date(Date.UTC(year!, month! - 1 + months, 1));
  const prefix = d.toISOString().slice(0, 7);
  if (!day) return prefix;
  const maxDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return `${prefix}-${String(Math.min(day, maxDay)).padStart(2, '0')}`;
}

export function deflateMonthly(points: MonetaryPoint[], ipc: IpcPoint[], basePeriod?: string): MonetaryPoint[] {
  const index = new Map(ipc.map(p => [p.period.slice(0, 7), p.value]));
  const base = basePeriod ?? ipc.filter(p => finite(p.value) && p.value > 0).map(p => p.period.slice(0, 7)).sort().at(-1);
  const b = base ? index.get(base) : null;
  return points.map(p => {
    const i = index.get(p.period);
    return { ...p, value: finite(p.value) && finite(b) && b > 0 && finite(i) && i > 0 ? p.value * b / i : null };
  });
}

/** Calcula antes de filtrar el rango visible; nunca usa posiciones como meses/años. */
export function prepareSeries(series: MonetarySeries, options: MonetaryOptions, ipc: IpcPoint[] = [], allSeries: MonetarySeries[] = []): MonetaryPoint[] {
  const { def } = series;
  const asOf = (options.asOf ?? today()).slice(0,10);
  const from = options.frequency === 'M' ? options.from?.slice(0,7) : options.from;
  const to = options.frequency === 'M' ? options.to?.slice(0,7) : options.to;
  let points: MonetaryPoint[];
  if (options.frequency === 'D') {
    if (def.frequency !== 'D' || options.valueMode === 'real') return [];
    points = series.observations.filter(o => o.date <= asOf).map(o => ({period:o.date, value:o.value, effectiveDate:o.date, partial:false, coverageCount:finite(o.value) ? 1 : 0}));
  } else {
    if (def.frequency === 'M' && def.monthlyConvention !== options.monthlyMode) return [];
    points = aggregateMonthly(series.observations, options.monthlyMode, asOf);
    // Preferir cada mes oficial compatible; no confundir cierres oficiales con promedios.
    const companion = allSeries.find(s => s.def.id === def.monthlyCompanionId && s.def.monthlyConvention === options.monthlyMode);
    if (companion) {
      const official = aggregateMonthly(companion.observations, 'close', asOf);
      const merged = new Map(points.map(p => [p.period, p]));
      for (const p of official) if (finite(p.value)) merged.set(p.period, p);
      points = [...merged.values()].sort((a,b) => a.period.localeCompare(b.period));
    }
    if (options.valueMode === 'real') {
      if (def.currency !== 'ARS' || def.kind !== 'stock' || def.unit === '%') return [];
      points = deflateMonthly(points, ipc, options.basePeriod);
    }
  }
  points.sort((a,b) => a.period.localeCompare(b.period));
  const byDate = new Map(points.map(p => [p.period, p]));
  const isChange = options.transform !== 'level' && options.transform !== 'base100';
  const base = options.basePeriod ? points.find(p => p.period === options.basePeriod)?.value : points.find(p => finite(p.value) && (!from || p.period >= from))?.value;
  const result = points.map((p, idx) => {
    let value = p.value;
    if (options.transform === 'base100') value = finite(value) && finite(base) && base !== 0 ? 100 * value / base : null;
    else if (isChange) {
      const rateChange = options.transform === 'change_pp' || options.transform === 'change_bp';
      const previous = rateChange && options.frequency === 'D' ? points[idx - 1] : byDate.get(shiftMonth(p.period, options.transform === 'pct_yoy' ? -12 : -1));
      if (p.partial || previous?.partial || !finite(value) || !finite(previous?.value)) value = null;
      else if (rateChange) value = (value - previous.value) * (options.transform === 'change_bp' ? 100 : 1);
      else if (def.kind === 'rate') value = null; // No variación porcentual de una tasa.
      else if (options.transform === 'absolute_mom') value -= previous.value;
      else value = previous.value !== 0 ? (value / previous.value - 1) * 100 : null;
    }
    return {...p, value};
  });
  return result.filter(p => (!from || p.period >= from) && (!to || p.period <= to));
}

/** Aritmética estricta por fecha: null no equivale a cero. */
export function combineObservations(series: MonetarySeries[], calculate: (values: number[]) => number | null): MonetaryObservation[] {
  if (!series.length) return [];
  const maps = series.map(s => new Map(s.observations.map(o => [o.date, o.value])));
  const dates = [...new Set(series.flatMap(s => s.observations.map(o => o.date)))].sort();
  return dates.map(date => {
    const values = maps.map(m => m.get(date));
    const value = values.every(finite) ? calculate(values) : null;
    return {date, value: finite(value) ? value : null};
  });
}

export function compatibleRatio(a: MonetaryDef, b: MonetaryDef): boolean {
  return a.currency === b.currency && a.currency !== null && a.sector === b.sector && a.coverage === b.coverage && a.frequency === b.frequency && a.unit === b.unit;
}

/** Alinea componentes ANTES de promediar o cerrar; impide apilar calendarios diferentes. */
export function prepareComposition(series: MonetarySeries[], options: MonetaryOptions, ipc: IpcPoint[] = []): MonetaryPoint[][] {
  if (!series.length) return [];
  const first = series[0]!.def;
  if (series.some(s => s.def.currency !== first.currency || s.def.frequency !== first.frequency || s.def.unit !== first.unit)) return series.map(()=>[]);
  const maps = series.map(s=>new Map(s.observations.map(o=>[o.date,o.value])));
  const dates = [...new Set(series.flatMap(s=>s.observations.map(o=>o.date)))].sort();
  const common = new Set(dates.filter(date=>maps.every(m=>finite(m.get(date)))));
  return series.map((s,i)=>prepareSeries({...s,def:{...s.def,monthlyCompanionId:undefined},observations:dates.map(date=>({date,value:common.has(date)? maps[i]!.get(date)!:null}))},options,ipc));
}

/** Lista versionada, misma fuente contable. No incluye activos, LEFI ni títulos en garantía. */
export const ELIGIBLE_BALANCE_V1 = [1248, 1258, 1260, 1262] as const;

export function deriveMonetarySeries(input: MonetarySeries[]): MonetarySeries[] {
  const result = [...input];
  const byId = (id: number) => input.find(s => s.def.bcraId === id);
  const add = (id: string, name: string, ids: number[], category: string, calc: (v:number[])=>number|null, overrides: Partial<MonetaryDef> = {}) => {
    const components = ids.map(byId);
    if (components.some(s => !s)) return;
    const sources = components as MonetarySeries[];
    if (new Set(sources.map(s=>s.def.currency)).size !== 1 || new Set(sources.map(s=>s.def.frequency)).size !== 1) return;
    const observations = combineObservations(sources, calc);
    const valid = observations.filter(o => o.value !== null);
    result.push({def:{...sources[0]!.def, id:`monetario.${id}`, bcraId:0, name, shortName:name, category, monthlyCompanionId:undefined,
      firstDate:valid[0]?.date ?? '', lastDate:valid.at(-1)?.date ?? '', methodology:`Cálculo propio por fechas comunes: ${ids.join(', ')}. Sin imputar faltantes. Promedio mensual sobre observaciones simultáneas.`, ...overrides}, observations,
      retrievedAt:sources.map(s=>s.retrievedAt).sort()[0]!, stale:sources.some(s=>s.stale), ...(sources.some(s=>s.error) ? {error:'Un componente tiene datos conservados de una consulta anterior.'}: {})});
  };
  const sum = (v:number[]) => v.reduce((a,b)=>a+b,0);
  add('m1.privado','M1 privado (construcción propia)',[17,69,94],'m1',sum,{group:'aggregates',sector:'private',coverage:'Circulante + cheques cancelatorios ARS + depósitos privados no financieros',methodology:'Construcción propia por fechas comunes desde2005: circulante17 + cheques cancelatorios69 + cuenta corriente privada94. Se excluye historia2003/04 que requeriría cuasimonedas. No es una nueva serie oficial.'});
  add('m3.privado','M3 privado (construcción propia)',[17,69,100],'m3',sum,{group:'aggregates',sector:'private',coverage:'Circulante + cheques cancelatorios ARS + depósitos privados no financieros',methodology:'Construcción propia por fechas comunes desde2005: circulante17 + cheques cancelatorios69 + depósitos privados100. Se excluye historia2003/04 que requeriría cuasimonedas. No es una nueva serie oficial.'});
  for (const s of result.filter(s=>['monetario.m1.privado','monetario.m3.privado'].includes(s.def.id))) {
    s.observations=s.observations.filter(o=>o.date>='2005-01-01');
    s.def.firstDate=s.observations.find(o=>o.value!==null)?.date ?? '';
  }
  add('depositos.publicos.USD','Depósitos públicos USD (total − privados)',[107,108],'total',v=>v[0]!-v[1]!,{sector:'public',coverage:'Entidades financieras; sector público no financiero',methodology:'Construcción propia107−108 por fechas comunes, no financiero. Evita usar1494, cuya moneda y unidad declaradas son inconsistentes.'});
  add('residuo_depositos.publicos.ARS','Residuo depósitos públicos ARS',[1229,1230,1231],'residuo',v=>v[0]!-v[1]!-v[2]!,{methodology:'Depósitos públicos1229 − vista1230 − plazo1231, mismo juego IMD y fechas comunes. No se mezcla con cuentas corrientes1457 y cajas1461, cuyo tratamiento del Fondo Unificado difiere.'});
  for (const [currency, offset] of [['ARS',0],['USD',8]] as const) {
    add(`comerciales.${currency}`,`Comerciales ${currency}`, [110+offset,111+offset,116+offset], 'comerciales', sum);
    add(`consumo.${currency}`,`Consumo ${currency}`, [114+offset,115+offset], 'consumo', sum);
    add(`garantia_real.${currency}`,`Garantía real ${currency}`, [112+offset,113+offset], 'garantia_real', sum);
    const loans = byId(117+offset), deposits = byId(currency === 'ARS' ? 100 : 108);
    if (loans && deposits && compatibleRatio(loans.def,deposits.def)) add(`ratio.${currency}`,`Préstamos / depósitos privados ${currency}`, [117+offset,currency === 'ARS'?100:108], 'ratio', v=>v[1]!!==0?v[0]!/v[1]!*100:null,
      {unit:'%',currency:null,convention:'Ratio diario; promedio mensual de ratios diarios',methodology:'Préstamos privados / depósitos privados, misma moneda, cobertura y fecha. Mensual: promedio de ratios diarios o ratio en última fecha común.'});
    const deps = currency === 'ARS' ? [100,94,95,96,97,98,99] : [108,1565,1569,1571,1586];
    add(`residuo_depositos.${currency}`,`Residuo depósitos ${currency}`, deps, 'residuo', v=>v[0]!-sum(v.slice(1)));
    add(`residuo_prestamos.${currency}`,`Residuo préstamos ${currency}`, [117+offset,...Array.from({length:7},(_,i)=>110+offset+i)], 'residuo', v=>v[0]!-sum(v.slice(1)));
  }
  for (const [a,b,label] of [[44,7,'TAMAR − BADLAR'],[14,7,'Personales − BADLAR'],[13,7,'Adelantos − BADLAR']] as const) {
    const x=byId(a),y=byId(b);
    if (x && y && x.def.convention === y.def.convention && x.def.currency === y.def.currency) add(`spread.${a}.${b}`,label,[a,b],'spread',v=>v[0]!-v[1]!,{group:'passive_rates',unit:'puntos porcentuales',convention:'Diferencia entre TNA; puntos porcentuales'});
  }
  add('base_instrumentos.v1','Base monetaria + letras ARS y pases pasivos (v1)',[...ELIGIBLE_BALANCE_V1], 'base_instrumentos',sum,{group:'base',methodology:'Construcción propia v1 = BCRA 1248 + 1258 + 1260 + 1262; balance contable ARS, fechas comunes. Excluye pases activos, LEFI del Tesoro, deuda en moneda extranjera y títulos en garantía. Faltantes impiden el total; no se imputa cero por discontinuación.'});
  return result;
}
