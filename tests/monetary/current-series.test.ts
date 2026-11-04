import { describe, expect, it } from 'vitest';
import { deriveMonetarySeries, prepareComposition, prepareSeries } from '../../src/monetary/analytics';
import { MONETARY_CATALOG } from '../../src/monetary/catalog';
import type { MonetarySeries } from '../../src/monetary/types';
import { selectableMonetarySeries } from '../../src/web/lib/monetarySelection';

const make=(id:number,value:number,date='2026-10-29'):MonetarySeries=>({def:{...MONETARY_CATALOG.find(s=>s.bcraId===id)!},observations:[{date,value}],retrievedAt:'2026-11-04T19:00:00Z',stale:false});
const values:[number,number][]=[[91,170045511],[100,126797637],[85,38193041],[94,22347065],[86,31206457],[95,30228656],[87,95636056.292],[96,70918024.292],[88,2104082.708],[97,1317028.708],[17,20000000],[69,0]];
const input=()=>[...values.map(([id,value])=>make(id,value)),make(1229,27011173,'2026-05-07'),make(1230,9434436,'2026-05-07'),make(1231,16757781,'2026-05-07'),...([1232,1233,1234,1239] as const).map(id=>make(id,1,'2026-05-07'))];
describe('series vigentes obtenidas de componentes API BCRA',()=>{
  it('depósitos públicos llegan al corte de componentes, sin extender el histórico de mayo',()=>{
    const out=deriveMonetarySeries(input());
    const current=out.find(s=>s.def.id==='monetario.depositos.publicos.ARS')!;
    expect(current.observations).toEqual([{date:'2026-10-29',value:43247874}]);
    expect(current.def).toMatchObject({bcraId:0,sector:'public',currency:'ARS',lastDate:'2026-10-29'});
    expect(out.find(s=>s.def.bcraId===1229)?.observations.at(-1)?.date).toBe('2026-05-07');
  });
  it('composición corriente usa total, vista y plazo de fechas comunes y reconcilia',()=>{
    const out=deriveMonetarySeries(input());
    const parts=['monetario.vista.publicos.ARS','monetario.plazo.publicos.ARS','monetario.residuo_depositos.publicos.ARS'].map(id=>out.find(s=>s.def.id===id)!);
    const points=prepareComposition(parts,{frequency:'M',monthlyMode:'mean',valueMode:'nominal',transform:'level',asOf:'2026-11-04'});
    expect(points.map(p=>p[0]!.effectiveDate)).toEqual(['2026-10-29','2026-10-29','2026-10-29']);
    expect(points.reduce((a,p)=>a+p[0]!.value!,0)).toBeCloseTo(43247874);
  });
  it('M1/M2/M3 totales y M2 privado usan componentes actuales, no empalmes',()=>{
    const out=deriveMonetarySeries(input());
    for(const [id,value] of [['monetario.m1.total',58193041],['monetario.m2.total',89399498],['monetario.m3.total',190045511],['monetario.m2.privado',72575721]] as const){
      expect(out.find(s=>s.def.id===id)?.observations).toEqual([{date:'2026-10-29',value}]);
    }
  });
  it('la selección principal elige las construcciones actuales y conserva histórico si falta alternativa',()=>{
    const selected=selectableMonetarySeries(deriveMonetarySeries(input()));
    expect(selected.some(s=>[1229,1230,1231,1232,1233,1234,1239].includes(s.def.bcraId))).toBe(false);
    expect(selected.some(s=>s.def.id==='monetario.depositos.publicos.ARS')).toBe(true);
    expect(selectableMonetarySeries([make(1229,10,'2026-05-07')])[0]?.def.bcraId).toBe(1229);
  });
  it('falta en una fecha impide construir total: no arrastra el otro componente',()=>{
    const out=deriveMonetarySeries([make(91,100),make(100,80,'2026-10-28')]);
    expect(out.find(s=>s.def.id==='monetario.depositos.publicos.ARS')?.observations.every(o=>o.value===null)).toBe(true);
  });
  it('los cierres de agregados siguen prefiriendo la serie mensual oficial compatible',()=>{
    const out=deriveMonetarySeries(input());
    const series=out.find(s=>s.def.id==='monetario.m1.total')!;
    const official=make(1612,57000000,'2026-10-31');
    const opts={frequency:'M' as const,monthlyMode:'close' as const,valueMode:'nominal' as const,transform:'level' as const,asOf:'2026-11-04'};
    expect(prepareSeries(series,opts,[],[official])[0]?.value).toBe(57000000);
    expect(prepareSeries(series,{...opts,monthlyMode:'mean'},[],[official])[0]?.value).toBe(58193041);
  });
});
