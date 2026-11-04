/**
 * Períodos canónicos y aritmética por calendario (nunca por posición de fila).
 *  M: "2024-03"   Q: "2024-Q1"   S: "2024-S1"   A: "2024"
 */
import type { Frequency, Period } from './types';

const RE: Record<Frequency, RegExp> = {
  M: /^(\d{4})-(0[1-9]|1[0-2])$/,
  Q: /^(\d{4})-Q([1-4])$/,
  S: /^(\d{4})-S([12])$/,
  A: /^(\d{4})$/,
};

export const PERIODS_PER_YEAR: Record<Frequency, number> = { M: 12, Q: 4, S: 2, A: 1 };

export function isValidPeriod(p: string, f: Frequency): boolean {
  return RE[f].test(p);
}

export function frequencyOf(p: Period): Frequency {
  for (const f of ['M', 'Q', 'S', 'A'] as Frequency[]) if (RE[f].test(p)) return f;
  throw new Error(`Período inválido: "${p}"`);
}

/** Descompone un período en año y sub-período (1-based). A -> sub = 1. */
export function parsePeriod(p: Period): { year: number; sub: number; freq: Frequency } {
  const freq = frequencyOf(p);
  const m = RE[freq].exec(p)!;
  return { year: Number(m[1]), sub: freq === 'A' ? 1 : Number(m[2]), freq };
}

export function makePeriod(year: number, sub: number, freq: Frequency): Period {
  switch (freq) {
    case 'M':
      return `${year}-${String(sub).padStart(2, '0')}`;
    case 'Q':
      return `${year}-Q${sub}`;
    case 'S':
      return `${year}-S${sub}`;
    case 'A':
      return `${year}`;
  }
}

/** Índice ordinal (para comparar/restar períodos de igual frecuencia). */
export function periodOrdinal(p: Period): number {
  const { year, sub, freq } = parsePeriod(p);
  return year * PERIODS_PER_YEAR[freq] + (sub - 1);
}

export function fromOrdinal(ord: number, freq: Frequency): Period {
  const n = PERIODS_PER_YEAR[freq];
  const year = Math.floor(ord / n);
  return makePeriod(year, (ord % n) + 1, freq);
}

/** Desplaza k períodos (k negativo = hacia atrás). */
export function shiftPeriod(p: Period, k: number): Period {
  const { freq } = parsePeriod(p);
  return fromOrdinal(periodOrdinal(p) + k, freq);
}

export function comparePeriods(a: Period, b: Period): number {
  return periodOrdinal(a) - periodOrdinal(b);
}

/** Lista inclusiva de períodos entre a y b. */
export function periodRange(a: Period, b: Period): Period[] {
  const { freq } = parsePeriod(a);
  const out: Period[] = [];
  for (let o = periodOrdinal(a); o <= periodOrdinal(b); o++) out.push(fromOrdinal(o, freq));
  return out;
}

/**
 * Fecha representativa del período = primer día del período (convención del proyecto,
 * usada en Sheets y en el eje temporal del dashboard). Devuelve "YYYY-MM-DD".
 */
export function periodStartDate(p: Period): string {
  const { year, sub, freq } = parsePeriod(p);
  const month = freq === 'M' ? sub : freq === 'Q' ? (sub - 1) * 3 + 1 : freq === 'S' ? (sub - 1) * 6 + 1 : 1;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** Número de serie de fecha de Google Sheets/Excel (días desde 1899-12-30), sin zona horaria. */
export function periodToSheetsSerial(p: Period): number {
  const [y, m, d] = periodStartDate(p).split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const ROMANOS = ['I', 'II', 'III', 'IV'];

/** Etiqueta corta en español: "mar-24", "II-24" (trim.), "1S-24", "2024". */
export function formatPeriodShort(p: Period): string {
  const { year, sub, freq } = parsePeriod(p);
  const yy = String(year).slice(2);
  if (freq === 'M') return `${MESES[sub - 1]}-${yy}`;
  if (freq === 'Q') return `${ROMANOS[sub - 1]}-${yy}`;
  if (freq === 'S') return `${sub}S-${yy}`;
  return String(year);
}

/** Etiqueta larga: "marzo 2024", "2.º trimestre 2024", "1.er semestre 2024", "2024". */
export function formatPeriodLong(p: Period): string {
  const { year, sub, freq } = parsePeriod(p);
  if (freq === 'M') return `${MESES_LARGOS[sub - 1]} ${year}`;
  if (freq === 'Q') return `${sub}.º trimestre ${year}`;
  if (freq === 'S') return `${sub === 1 ? '1.er' : '2.º'} semestre ${year}`;
  return String(year);
}

// ------------------------------------------------------------ Parsing de la API

/** "202403" -> "2024-03". */
export function fromYYYYMM(raw: string): Period {
  const s = String(raw).trim();
  if (!/^\d{6}$/.test(s)) throw new Error(`Período AAAAMM inválido: "${raw}"`);
  const p = `${s.slice(0, 4)}-${s.slice(4, 6)}`;
  if (!isValidPeriod(p, 'M')) throw new Error(`Mes inválido: "${raw}"`);
  return p;
}

/** Período canónico -> "AAAAMM" (para filtros PostgREST). */
export function toYYYYMM(p: Period): string {
  const { year, sub, freq } = parsePeriod(p);
  if (freq !== 'M') throw new Error(`toYYYYMM requiere período mensual: ${p}`);
  return `${year}${String(sub).padStart(2, '0')}`;
}

/** "20162T" (EPH: AAAA + N.º de trimestre + "T") -> "2016-Q2". */
export function fromEphQuarter(raw: string): Period {
  const m = /^(\d{4})([1-4])T$/.exec(String(raw).trim());
  if (!m) throw new Error(`Período trimestral EPH inválido: "${raw}"`);
  return `${m[1]}-Q${m[2]}`;
}

/** "20261S" (EPH: AAAA + N.º de semestre + "S") -> "2026-S1". */
export function fromEphSemester(raw: string): Period {
  const m = /^(\d{4})([12])S$/.exec(String(raw).trim());
  if (!m) throw new Error(`Período semestral EPH inválido: "${raw}"`);
  return `${m[1]}-S${m[2]}`;
}

/** Período actual en Buenos Aires (mensual), útil para ventanas de revisión. */
export function currentMonthBA(now = new Date()): Period {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  return `${parts.year}-${parts.month}`;
}
