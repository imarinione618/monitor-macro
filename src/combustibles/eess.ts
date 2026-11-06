/**
 * Res. 1104/04 — precios y volúmenes de estaciones de servicio (declaración jurada mensual).
 * Precio de surtidor promedio ponderado por volumen, canal «Al público», por producto y ámbito.
 */
import { parseDecimal, readCsv } from './csv';
import { CABA_PROVINCE, EESS_CHANNEL, EESS_PRODUCT_NAMES, MIN_SAMPLE, PRODUCTS, VOLUME_OUTLIER_FACTOR, eessId } from './defs';
import { median, withinBand } from './surtidor';
import type { FuelObservation, FuelProduct } from './types';

export interface EessStats { rows: number; used: number; otherChannelOrProduct: number; badPeriod: number; noMovement: number; badVolume: number; badPrice: number }

interface Bucket { prices: number[]; volumes: number[]; caba: boolean[] }

/** Acumula registros válidos por período|producto; el filtro de outliers se aplica al cerrar. */
export class EessAccumulator {
  readonly buckets = new Map<string, Bucket>();
  add(period: string, product: FuelProduct, caba: boolean, price: number, volume: number): void {
    const key = `${period}|${product}`;
    let b = this.buckets.get(key);
    if (!b) { b = { prices: [], volumes: [], caba: [] }; this.buckets.set(key, b); }
    b.prices.push(price); b.volumes.push(volume); b.caba.push(caba);
  }
  /** Incorpora los registros de `other` de los períodos indicados. */
  merge(other: EessAccumulator, periods: Set<string>): void {
    for (const [key, b] of other.buckets) {
      if (!periods.has(key.split('|')[0]!)) continue;
      const target = this.buckets.get(key);
      if (target) for (let i = 0; i < b.prices.length; i++) { target.prices.push(b.prices[i]!); target.volumes.push(b.volumes[i]!); target.caba.push(b.caba[i]!); }
      else this.buckets.set(key, b);
    }
  }
  periods(): string[] { return [...new Set([...this.buckets.keys()].map(k => k.split('|')[0]!))].sort(); }
}

/** 'YYYY/MM' (archivo vigente) o anio + mes (archivos anuales) → 'YYYY-MM'. */
export function parsePeriod(periodo: string | undefined, anio?: string, mes?: string): string | null {
  let y: number, m: number;
  const p = periodo?.trim();
  if (p) {
    const match = /^(\d{4})\/(\d{1,2})$/.exec(p);
    if (!match) return null;
    y = Number(match[1]); m = Number(match[2]);
  } else {
    if (!anio || !mes || !/^\d{4}$/.test(anio.trim()) || !/^\d{1,2}$/.test(mes.trim())) return null;
    y = Number(anio); m = Number(mes);
  }
  if (y < 2000 || y > 2100 || m < 1 || m > 12) return null;
  return `${y}-${String(m).padStart(2, '0')}`;
}

const REQUIRED = ['provincia', 'producto', 'canal_de_comercializacion', 'volumen', 'precio_surtidor'];

export async function readEessCsv(lines: AsyncIterable<string>, acc: EessAccumulator, label: string): Promise<EessStats> {
  const { index, header, rows } = await readCsv(lines, REQUIRED, label);
  const hasPeriodo = index.periodo !== undefined;
  if (!hasPeriodo && (index.anio === undefined || index.mes === undefined)) throw new Error(`${label}: cambió el esquema (sin periodo ni anio/mes)`);
  const noMovCol = index.no_movimientos ?? index.no_novimientos;
  const at = (r: string[], i: number | undefined) => (i === undefined ? '' : r[i] ?? '');
  const stats: EessStats = { rows: 0, used: 0, otherChannelOrProduct: 0, badPeriod: 0, noMovement: 0, badVolume: 0, badPrice: 0 };
  for await (const r of rows) {
    stats.rows++;
    if (r.length !== header.length) { stats.badPeriod++; continue; }
    const product = EESS_PRODUCT_NAMES[at(r, index.producto).trim()];
    if (!product || at(r, index.canal_de_comercializacion).trim() !== EESS_CHANNEL) { stats.otherChannelOrProduct++; continue; }
    const period = hasPeriodo ? parsePeriod(at(r, index.periodo)) : parsePeriod(undefined, at(r, index.anio), at(r, index.mes));
    if (!period) { stats.badPeriod++; continue; }
    const noMov = at(r, noMovCol).trim().toUpperCase();
    if (noMov && noMov !== 'NO') { stats.noMovement++; continue; }
    const volume = parseDecimal(at(r, index.volumen));
    if (volume === null || !(volume > 0)) { stats.badVolume++; continue; }
    const price = parseDecimal(at(r, index.precio_surtidor));
    if (price === null || !(price > 0)) { stats.badPrice++; continue; }
    acc.add(period, product, at(r, index.provincia).trim().toUpperCase() === CABA_PROVINCE, price, volume);
    stats.used++;
  }
  if (!stats.rows) throw new Error(`${label}: sin filas`);
  return stats;
}

/**
 * Promedio ponderado por volumen tras filtrar outliers de precio (±OUTLIER_BAND de la mediana
 * nacional del mes/producto) y de volumen (> VOLUME_OUTLIER_FACTOR × mediana nacional del volumen).
 */
export function finalizeEess(acc: EessAccumulator): Map<string, FuelObservation[]> {
  const out = new Map<string, FuelObservation[]>();
  for (const product of PRODUCTS) for (const scope of ['nacional', 'caba'] as const) out.set(eessId(product, scope), []);
  for (const period of acc.periods()) {
    for (const product of PRODUCTS) {
      const b = acc.buckets.get(`${period}|${product}`);
      const reference = b ? median(b.prices) : null;
      const volumeCap = b ? median(b.volumes)! * VOLUME_OUTLIER_FACTOR : 0;
      for (const scope of ['nacional', 'caba'] as const) {
        let pv = 0, v = 0, n = 0;
        if (b && reference !== null) {
          for (let i = 0; i < b.prices.length; i++) {
            if (scope === 'caba' && !b.caba[i]) continue;
            if (!withinBand(b.prices[i]!, reference) || b.volumes[i]! > volumeCap) continue;
            pv += b.prices[i]! * b.volumes[i]!; v += b.volumes[i]!; n++;
          }
        }
        out.get(eessId(product, scope))!.push({ date: period, value: n >= MIN_SAMPLE && v > 0 ? pv / v : null, n });
      }
    }
  }
  return out;
}

export interface CkanResource { id: string; name: string; url: string }

/** Archivos anuales «Precios EESS AAAA» (desde `firstYear`) y el vigente, a partir de package_show. */
export function pickEessResources(resources: CkanResource[], firstYear: number, vigenteId: string): { annual: { year: number; url: string }[]; vigente: string | null } {
  const annual = resources
    .map(r => ({ m: /^Precios EESS (\d{4})\s*$/.exec(r.name.trim()), url: r.url }))
    .filter(x => x.m && Number(x.m[1]) >= firstYear)
    .map(x => ({ year: Number(x.m![1]), url: x.url }))
    .sort((a, b) => a.year - b.year);
  return { annual, vigente: resources.find(r => r.id === vigenteId)?.url ?? null };
}
