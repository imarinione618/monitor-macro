/**
 * Res. 314/2016 — precios en surtidor: eventos de cambio de precio por estación → mediana diaria.
 *
 * Un «evento» es (estación, producto, fecha_vigencia, precio). Para cada día d el precio de la
 * estación es el último evento con vigencia ≤ 23:59 de d (hora local tal como se publica, sin
 * conversión de huso). No se interpola ni se arrastra más allá de SURTIDOR_MAX_AGE_DAYS.
 */
import { parseDecimal, readCsv } from './csv';
import {
  CABA_PROVINCE, MIN_SAMPLE, OUTLIER_BAND, PRODUCTS, SURTIDOR_HORARIO_ID, SURTIDOR_HORARIO_NAME, SURTIDOR_MAX_AGE_DAYS,
  SURTIDOR_MIN_VALID_DAY, SURTIDOR_PRODUCT_IDS, SURTIDOR_STATE_RETENTION_DAYS, surtidorId,
} from './defs';
import type { FuelObservation, FuelProduct } from './types';

// ── Fechas ────────────────────────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' → número de día (días desde 1970-01-01). Fecha inválida → NaN. */
export function dayNumber(day: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(0);
  check.setUTCFullYear(y, mo - 1, d); // setUTCFullYear no reinterpreta los años 0–99 como 19xx
  const t = check.getTime();
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return NaN;
  return t / 86_400_000;
}
export function dayString(n: number): string { return new Date(n * 86_400_000).toISOString().slice(0, 10); }
export function addDays(day: string, delta: number): string { return dayString(dayNumber(day) + delta); }
export function minuteString(minute: number): string { return new Date(minute * 60_000).toISOString().slice(0, 16).replace('T', ' '); }

/**
 * Fecha de vigencia en cualquiera de los dos formatos publicados:
 *   vigentes  `2026-11-02 13:23:00`   ·   histórico `01/04/2024 10:11` (dd/mm/yyyy hh:mm)
 * Devuelve minutos desde la época (hora local tratada como UTC) o null si es inválida.
 */
export function parseVigencia(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim();
  let y: string, mo: string, d: string, hh: string, mm: string;
  let m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) [d, mo, y, hh, mm] = [m[1]!, m[2]!, m[3]!, m[4]!, m[5]!];
  else {
    m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
    if (!m) return null;
    [y, mo, d, hh, mm] = [m[1]!, m[2]!, m[3]!, m[4]!, m[5]!];
  }
  const day = dayNumber(`${y}-${mo}-${d}`);
  const h = Number(hh), mi = Number(mm);
  if (!Number.isFinite(day) || h > 23 || mi > 59) return null;
  return day * 1440 + h * 60 + mi;
}

/** Hora de Argentina (UTC−3, sin horario de verano desde 2009) → 'YYYY-MM-DD'. */
export function argentinaDay(now: Date): string { return new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10); }

// ── Libro de eventos ──────────────────────────────────────────────────────────────────────────

export interface ReadStats { rows: number; used: number; otherProductOrSchedule: number; badDate: number; outOfRange: number; badPrice: number; malformed: number; conflicts: number }
const emptyStats = (): ReadStats => ({ rows: 0, used: 0, otherProductOrSchedule: 0, badDate: 0, outOfRange: 0, badPrice: 0, malformed: 0, conflicts: 0 });

/**
 * Eventos por estación|producto. Dos declaraciones distintas con la misma marca de tiempo dentro de
 * la misma fuente son ambiguas y se descartan (la estación conserva su precio anterior). Entre
 * fuentes, la más reciente (vigentes) prevalece sobre el histórico.
 */
export class EventBook {
  readonly events = new Map<string, Map<number, number>>();
  readonly caba = new Set<string>();
  readonly stations = new Set<string>();
  private readonly sourceOf = new Map<string, Map<number, number>>();
  private source = 0;

  /** Inicia una nueva fuente: sus eventos prevalecen sobre los de fuentes anteriores. */
  beginSource(): void { this.source++; }

  add(station: string, product: FuelProduct, minute: number, price: number, stats?: ReadStats): void {
    const key = `${station}|${product}`;
    let byMinute = this.events.get(key);
    if (!byMinute) { byMinute = new Map(); this.events.set(key, byMinute); }
    let sources = this.sourceOf.get(key);
    if (!sources) { sources = new Map(); this.sourceOf.set(key, sources); }
    const previous = byMinute.get(minute);
    if (previous !== undefined && sources.get(minute) === this.source) {
      if (previous !== price && !Number.isNaN(previous)) { byMinute.set(minute, NaN); if (stats) stats.conflicts++; }
      return;
    }
    byMinute.set(minute, price);
    sources.set(minute, this.source);
  }

  setProvince(station: string, province: string): void {
    this.stations.add(station);
    if (province.trim().toUpperCase() === CABA_PROVINCE) this.caba.add(station); else this.caba.delete(station);
  }

  maxMinute(): number | null {
    let max: number | null = null;
    for (const byMinute of this.events.values()) for (const [minute, price] of byMinute) if (!Number.isNaN(price) && (max === null || minute > max)) max = minute;
    return max;
  }
}

const REQUIRED = ['idempresa', 'provincia', 'idproducto', 'producto', 'idtipohorario', 'tipohorario', 'precio', 'fecha_vigencia'];

/**
 * Lee un CSV de la Res. 314 (vigentes o histórico) hacia el libro de eventos.
 * Valida esquema y nombres de producto; descarta fechas basura (antes de 2016 o posteriores a `today`).
 */
export async function readSurtidorCsv(lines: AsyncIterable<string>, book: EventBook, today: string, label: string): Promise<ReadStats> {
  const { index, header, rows } = await readCsv(lines, REQUIRED, label);
  const stats = emptyStats();
  const min = dayNumber(SURTIDOR_MIN_VALID_DAY) * 1440;
  const max = (dayNumber(today) + 1) * 1440 - 1;
  const at = (r: string[], c: string) => r[index[c]!] ?? '';
  book.beginSource();
  for await (const r of rows) {
    stats.rows++;
    if (r.length !== header.length) { stats.malformed++; continue; }
    const idProduct = at(r, 'idproducto').trim();
    const mapped = SURTIDOR_PRODUCT_IDS[idProduct];
    const horario = at(r, 'idtipohorario').trim();
    if (!mapped || horario !== SURTIDOR_HORARIO_ID) { stats.otherProductOrSchedule++; continue; }
    if (at(r, 'producto').trim() !== mapped.name) throw new Error(`${label}: el producto ${idProduct} ahora se llama «${at(r, 'producto')}»; revisar el mapeo`);
    if (at(r, 'tipohorario').trim() !== SURTIDOR_HORARIO_NAME) throw new Error(`${label}: el horario ${horario} ahora se llama «${at(r, 'tipohorario')}»`);
    const station = at(r, 'idempresa').trim();
    if (!/^\d+$/.test(station)) { stats.malformed++; continue; }
    const minute = parseVigencia(at(r, 'fecha_vigencia'));
    if (minute === null) { stats.badDate++; continue; }
    if (minute < min || minute > max) { stats.outOfRange++; continue; }
    const price = parseDecimal(at(r, 'precio'));
    if (price === null) { stats.badPrice++; continue; }
    book.setProvince(station, at(r, 'provincia'));
    book.add(station, mapped.product, minute, price, stats);
    stats.used++;
  }
  if (stats.rows === 0) throw new Error(`${label}: sin filas`);
  if (stats.malformed > stats.rows * 0.01) throw new Error(`${label}: ${stats.malformed} filas mal formadas de ${stats.rows}`);
  return stats;
}

// ── Cálculo diario ────────────────────────────────────────────────────────────────────────────

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Filtra precios fuera de ±OUTLIER_BAND de la mediana de referencia. */
export function withinBand(price: number, reference: number): boolean {
  return price >= reference * (1 - OUTLIER_BAND) && price <= reference * (1 + OUTLIER_BAND);
}

/**
 * Mediana diaria por producto, nacional y CABA, para los días [from, to] (inclusive).
 * Devuelve un mapa id de serie → observaciones (una por día; null si n < MIN_SAMPLE).
 */
export function computeDaily(book: EventBook, from: string, to: string): Map<string, FuelObservation[]> {
  const start = dayNumber(from), end = dayNumber(to);
  const out = new Map<string, FuelObservation[]>();
  for (const product of PRODUCTS) for (const scope of ['nacional', 'caba'] as const) out.set(surtidorId(product, scope), []);
  if (!(end >= start)) return out;
  interface Track { product: FuelProduct; caba: boolean; minutes: number[]; prices: number[]; ptr: number }
  const tracks: Track[] = [];
  const earliestUseful = (start - SURTIDOR_MAX_AGE_DAYS) * 1440;
  for (const [key, byMinute] of book.events) {
    const [station, product] = key.split('|') as [string, FuelProduct];
    const entries = [...byMinute].filter(([, p]) => !Number.isNaN(p)).sort((a, b) => a[0] - b[0]);
    if (!entries.length || entries.at(-1)![0] < earliestUseful) continue;
    tracks.push({ product, caba: book.caba.has(station), minutes: entries.map(e => e[0]), prices: entries.map(e => e[1]), ptr: -1 });
  }
  const pricesBy = new Map<FuelProduct, { price: number; caba: boolean }[]>();
  for (let d = start; d <= end; d++) {
    const endMinute = (d + 1) * 1440 - 1;
    for (const p of PRODUCTS) pricesBy.set(p, []);
    for (const t of tracks) {
      while (t.ptr + 1 < t.minutes.length && t.minutes[t.ptr + 1]! <= endMinute) t.ptr++;
      if (t.ptr < 0) continue;
      if (d - Math.floor(t.minutes[t.ptr]! / 1440) > SURTIDOR_MAX_AGE_DAYS) continue;
      const price = t.prices[t.ptr]!;
      if (!(price > 0)) continue;
      pricesBy.get(t.product)!.push({ price, caba: t.caba });
    }
    const date = dayString(d);
    for (const product of PRODUCTS) {
      const all = pricesBy.get(product)!;
      const reference = median(all.map(x => x.price));
      const kept = reference === null ? [] : all.filter(x => withinBand(x.price, reference));
      for (const scope of ['nacional', 'caba'] as const) {
        const sample = kept.filter(x => scope === 'nacional' || x.caba).map(x => x.price);
        out.get(surtidorId(product, scope))!.push({ date, value: sample.length >= MIN_SAMPLE ? median(sample) : null, n: sample.length });
      }
    }
  }
  return out;
}

/**
 * Último día cerrado: el día anterior al evento publicado más reciente (el publicador carga con
 * días de atraso y el último día con eventos suele estar incompleto), y nunca hoy ni días futuros.
 */
export function closedLastDay(maxMinute: number | null, today: string): string | null {
  if (maxMinute === null) return null;
  const lastEventDay = Math.floor(maxMinute / 1440);
  return dayString(Math.min(lastEventDay - 1, dayNumber(today) - 1));
}

// ── Estado persistido mínimo ──────────────────────────────────────────────────────────────────

/**
 * Estado para la corrida diaria sin descargar el histórico: por estación|producto, los eventos de
 * los últimos SURTIDOR_STATE_RETENTION_DAYS días más el último anterior (necesario para saber qué
 * precio estaba vigente al comienzo de la ventana). Codificado como «YYYY-MM-DD HH:MM=precio;…».
 */
export interface SurtidorState {
  schemaVersion: 1;
  builtAt: string;
  /** Eventos anteriores a este día (salvo el último de cada estación) se descartaron. */
  retainedFrom: string;
  caba: string[];
  events: Record<string, string>;
}

export function encodeState(book: EventBook, lastDay: string, builtAt: string): SurtidorState {
  const cutoff = dayNumber(lastDay) - SURTIDOR_STATE_RETENTION_DAYS;
  const cutoffMinute = cutoff * 1440;
  const events: Record<string, string> = {};
  const used = new Set<string>();
  for (const key of [...book.events.keys()].sort()) {
    const entries = [...book.events.get(key)!].filter(([, p]) => !Number.isNaN(p)).sort((a, b) => a[0] - b[0]);
    if (!entries.length || entries.at(-1)![0] < (cutoff - SURTIDOR_MAX_AGE_DAYS) * 1440) continue;
    const firstKept = entries.findIndex(([m]) => m >= cutoffMinute);
    const from = firstKept === -1 ? entries.length - 1 : Math.max(0, firstKept - 1);
    events[key] = entries.slice(from).map(([m, p]) => `${minuteString(m)}=${p}`).join(';');
    used.add(key.split('|')[0]!);
  }
  return { schemaVersion: 1, builtAt, retainedFrom: dayString(cutoff), caba: [...book.caba].filter(s => used.has(s)).sort((a, b) => Number(a) - Number(b)), events };
}

export function decodeState(state: SurtidorState): EventBook {
  if (state.schemaVersion !== 1 || typeof state.events !== 'object') throw new Error('Estado de surtidor ilegible');
  const book = new EventBook();
  book.beginSource();
  const caba = new Set(state.caba);
  for (const [key, encoded] of Object.entries(state.events)) {
    const [station, product] = key.split('|') as [string, FuelProduct];
    if (!PRODUCTS.includes(product)) throw new Error(`Estado de surtidor: producto inválido ${product}`);
    book.setProvince(station, caba.has(station) ? CABA_PROVINCE : '');
    for (const item of encoded.split(';')) {
      const [ts, price] = item.split('=');
      const minute = parseVigencia(ts);
      const value = parseDecimal(price);
      if (minute === null || value === null) throw new Error(`Estado de surtidor: evento inválido ${item}`);
      book.add(station, product, minute, value);
    }
  }
  return book;
}
