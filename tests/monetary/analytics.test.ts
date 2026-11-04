import { describe, expect, it } from 'vitest';
import { aggregateMonthly, combineObservations, compatibleRatio, deflateMonthly, deriveMonetarySeries, ELIGIBLE_BALANCE_V1, prepareSeries, type MonetaryOptions } from '../../src/monetary/analytics';
import { MONETARY_CATALOG } from '../../src/monetary/catalog';
import type { MonetarySeries } from '../../src/monetary/types';

const make = (id:number, rows:[string,number|null][]):MonetarySeries => ({def:{...MONETARY_CATALOG.find(s=>s.bcraId===id)!},observations:rows.map(([date,value])=>({date,value})),retrievedAt:'2026-11-04T12:00:00Z',stale:false});
const opts:MonetaryOptions = {frequency:'M',monthlyMode:'mean',valueMode:'nominal',transform:'level',asOf:'2026-11-04'};
describe('Convenciones monetarias',()=>{
  it('promedia observaciones publicadas sin completar días y distingue cierre efectivo',()=>{
    const obs=make(100,[['2026-09-01',10],['2026-09-03',30],['2026-09-30',null]]).observations;
    expect(aggregateMonthly(obs,'mean')[0]).toMatchObject({value:20,effectiveDate:'2026-09-03',coverageCount:2});
    expect(aggregateMonthly(obs,'close')[0]?.value).toBe(30);
  });
  it('no suma promedios con calendarios diferentes: primero fechas comunes',()=>{
    const a=make(110,[['2026-09-01',10],['2026-09-02',100]]), b=make(111,[['2026-09-01',20],['2026-09-03',200]]);
    const combined=combineObservations([a,b],v=>v[0]!+v[1]!);
    expect(combined.map(p=>p.value)).toEqual([30,null,null]);
    expect(aggregateMonthly(combined,'mean')[0]?.value).toBe(30);
  });
  it('mantiene cero distinto de faltante',()=>{
    expect(aggregateMonthly(make(100,[['2026-09-01',0]]).observations,'mean')[0]?.value).toBe(0);
    expect(aggregateMonthly(make(100,[['2026-09-01',null]]).observations,'mean')[0]?.value).toBeNull();
  });
  it('busca mes/año por calendario y no por fila',()=>{
    const s=make(100,[['2025-09-30',50],['2026-07-31',70],['2026-09-30',100]]);
    expect(prepareSeries(s,{...opts,transform:'pct_mom'}).at(-1)?.value).toBeNull();
    expect(prepareSeries(s,{...opts,transform:'pct_yoy'}).at(-1)?.value).toBe(100);
  });
  it('mes en curso parcial sin variación contra mes completo',()=>{
    const s=make(100,[['2026-10-30',100],['2026-11-02',110]]);
    expect(prepareSeries(s,opts).at(-1)).toMatchObject({partial:true,value:110});
    expect(prepareSeries(s,{...opts,transform:'pct_mom'}).at(-1)?.value).toBeNull();
  });
  it('deflacta con índice y no arrastra IPC; cambiar base no cambia crecimiento real',()=>{
    const s=make(100,[['2026-08-31',100],['2026-09-30',121],['2026-10-30',130]]);
    const ipc=[{period:'2026-08',value:100},{period:'2026-09',value:110}];
    const values=prepareSeries(s,{...opts,valueMode:'real'},ipc);
    expect(values.map(p=>p.value)).toEqual([110,121,null]);
    const a=prepareSeries(s,{...opts,valueMode:'real',transform:'pct_mom',basePeriod:'2026-08'},ipc);
    const b=prepareSeries(s,{...opts,valueMode:'real',transform:'pct_mom',basePeriod:'2026-09'},ipc);
    expect(a[1]?.value).toBeCloseTo(10); expect(b[1]?.value).toBeCloseTo(10);
  });
  it('no deflacta USD ni tasas ni inventa IPC diario',()=>{
    expect(prepareSeries(make(108,[['2026-09-30',10]]),{...opts,valueMode:'real'})).toEqual([]);
    expect(prepareSeries(make(44,[['2026-09-30',30]]),{...opts,valueMode:'real'})).toEqual([]);
    expect(prepareSeries(make(100,[['2026-09-30',10]]),{...opts,valueMode:'real',frequency:'D'})).toEqual([]);
  });
  it('30→32 son 2pp o200pb, nunca crecimiento porcentual',()=>{
    const s=make(44,[['2026-09-01',30],['2026-09-02',32]]);
    expect(prepareSeries(s,{...opts,frequency:'D',transform:'change_pp'}).at(-1)?.value).toBe(2);
    expect(prepareSeries(s,{...opts,frequency:'D',transform:'change_bp'}).at(-1)?.value).toBe(200);
    expect(prepareSeries(s,{...opts,frequency:'D',transform:'pct_mom'}).at(-1)?.value).toBeNull();
  });
  it('filtro se aplica después del cálculo y admite input fecha para mensual',()=>{
    const s=make(100,[['2026-08-31',100],['2026-09-30',110]]);
    const p=prepareSeries(s,{...opts,from:'2026-09-01',to:'2026-09-30',transform:'pct_mom'});
    expect(p).toHaveLength(1); expect(p[0]?.value).toBeCloseTo(10);
  });
  it('rechaza ratio con moneda, sector o cobertura diferente',()=>{
    const a=make(117,[]).def,b=make(100,[]).def;
    expect(compatibleRatio(a,b)).toBe(true);
    expect(compatibleRatio(a,{...b,sector:'total'})).toBe(false);
    expect(compatibleRatio(a,{...b,currency:'USD'})).toBe(false);
    expect(compatibleRatio(a,{...b,coverage:'otra'})).toBe(false);
  });
  it('corrige garantía real y evita sumar categorías agregadas a componentes',()=>{
    const input=Array.from({length:7},(_,i)=>make(110+i,[['2026-09-30',i+1]]));
    const out=deriveMonetarySeries(input);
    expect(out.find(s=>s.def.id==='monetario.garantia_real.ARS')?.observations[0]?.value).toBe(7);
    expect(out.find(s=>s.def.id==='monetario.comerciales.ARS')?.observations[0]?.value).toBe(10);
    expect(out.find(s=>s.def.id==='monetario.consumo.ARS')?.observations[0]?.value).toBe(11);
  });
  it('agregado auditado sin activos/LEFI, faltantes no cero tras extinción',()=>{
    expect([...ELIGIBLE_BALANCE_V1]).toEqual([1248,1258,1260,1262]);
    const input=ELIGIBLE_BALANCE_V1.map(id=>make(id,[['2026-09-30',id===1260?null:10]]));
    expect(deriveMonetarySeries(input).find(s=>s.def.id==='monetario.base_instrumentos.v1')?.observations[0]?.value).toBeNull();
  });
  it('prefiere cierre mensual oficial compatible sin usarlo como promedio',()=>{
    const s=make(15,[['2026-09-01',10],['2026-09-30',30]]), companion=make(1606,[['2026-09-01',25]]);
    s.def.monthlyCompanionId=companion.def.id;
    expect(prepareSeries(s,{...opts,monthlyMode:'mean'},[],[companion])[0]?.value).toBe(20);
    expect(prepareSeries(s,{...opts,monthlyMode:'close'},[],[companion])[0]?.value).toBe(25);
  });
  it('IPC base inexistente devuelve nulos',()=>{
    const p=aggregateMonthly(make(100,[['2026-09-30',100]]).observations,'mean');
    expect(deflateMonthly(p,[{period:'2026-09',value:100}],'2026-08')[0]?.value).toBeNull();
  });
  it('último mes con corte anterior al fin hábil se conserva parcial aun después del mes',()=>{
    const s=make(100,[['2026-09-30',100],['2026-10-29',110]]);
    expect(prepareSeries(s,opts).at(-1)?.partial).toBe(true);
    expect(prepareSeries(s,{...opts,transform:'pct_mom'}).at(-1)?.value).toBeNull();
  });
  it('composición pública ARS reconcilia total/vista/plazo del mismo juego, sin mezclar CC contable',()=>{
    const values:[[number,number],...[number,number][]]=[[91,143958154],[100,116946981],[85,27969269],[94,19454864],[86,31328530],[95,30408499],[87,80480920.507],[96,63748389.507],[88,1413699.493],[97,1388449.493],[1457,16233622]];
    const input=values.map(([id,value])=>make(id,[['2026-05-07',value]]));
    const residual=deriveMonetarySeries(input).find(s=>s.def.id==='monetario.residuo_depositos.publicos.ARS');
    expect(residual?.observations[0]?.value).toBeCloseTo(818956);
    expect(9434436+16757781+residual!.observations[0]!.value!).toBe(27011173);
  });
  it('M1/M3 propios incluyen cheques ARS y excluyen período de cuasimonedas',()=>{
    const input=[17,69,94,100].map(id=>make(id,[['2004-12-31',10],['2005-01-03',10]]));
    const out=deriveMonetarySeries(input).filter(s=>['monetario.m1.privado','monetario.m3.privado'].includes(s.def.id));
    expect(out).toHaveLength(2);
    expect(out.every(s=>s.observations.length===1 && s.observations[0]?.value===30 && s.def.firstDate==='2005-01-03')).toBe(true);
  });
});
