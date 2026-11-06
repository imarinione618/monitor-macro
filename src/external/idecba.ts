/**
 * IDECBA — Instituto de Estadística y Censos de la Ciudad de Buenos Aires.
 *
 * Descarga y parseo de:
 *  - IPCBA (base 2021=100): nivel general empalmado, divisiones, bienes/servicios,
 *    estacionales/regulados/resto (`fetchIpcba`).
 *  - Actividad en restaurantes tradicionales (encuesta EREST), índice de volumen físico
 *    base marzo 2015=100 (`fetchRestaurantes`).
 *
 * Las URLs de los XLSX cambian mes a mes: se resuelven por slug con la API de medios de
 * WordPress del sitio. Los parsers validan el layout (títulos con el período, encabezados,
 * meses en español, continuidad mensual, coherencia entre hojas) y lanzan errores claros:
 * nunca se devuelven datos parciales en silencio.
 *
 * Reglas: faltante = null (nunca 0), valores sin redondear, sin interpolar.
 * Solo servidor/CLI (usa `node:zlib` vía ./xlsx).
 */
import type { Observation, ObservationFlag } from '../core/types';
import { cellRef, excelSerialToDate, readXlsx, type CellValue, type XlsxSheet, type XlsxWorkbook } from './xlsx';

// ------------------------------------------------------------------ Contrato

export interface FeedSeriesInfo {
  key: string;
  name: string;
  shortName: string;
  unit: string;
  base?: string;
  measure: 'index';
  coverage: string;
  notes?: string[];
}

export interface FeedSourceFile {
  /** Nombre del archivo (sin extensión) tal como lo publica el IDECBA. */
  file: string;
  slug: string;
  url: string;
  /** `modified` informado por WordPress (hora local del sitio, sin zona). */
  modified: string;
}

export interface FeedResult {
  feed: string;
  sourceUrl: string;
  retrievedAt: string;
  series: Record<string, Observation[]>;
  info: FeedSeriesInfo[];
  /** Archivos efectivamente descargados (detalle adicional; `sourceUrl` es el principal). */
  files?: FeedSourceFile[];
}

export interface IdecbaFetchOptions {
  fetch?: typeof fetch;
  now?: () => Date;
  /** Reintentos ante errores de red / HTTP 5xx / 429 (por defecto 2). */
  retries?: number;
  timeoutMs?: number;
}

// ------------------------------------------------------------------ Constantes

export const IDECBA_SOURCE_LABEL = 'IDECBA (Instituto de Estadística y Censos de la Ciudad de Buenos Aires)';
/** Texto de fuente para gráficos (formato del proyecto). */
export const IDECBA_CHART_SOURCE = 'Fuente: one618 en base a IDECBA.';

export const IDECBA_SITE = 'https://www.estadisticaciudad.gob.ar';
export const IDECBA_MEDIA_API = `${IDECBA_SITE}/eyc/wp-json/wp/v2/media`;

export const IPCBA_FILES = {
  nivelGeneral: 'IPCBA_base_2021100-Nivel_general_empalme',
  aperturas: 'IPCBA_base_2021100-Principales_aperturas_indices',
  bienesServicios: 'IPCBA_base_2021100-Evol_gral_bs_svcios',
  estacionalesRegulados: 'IPCBA_base_2021100-Evol_gral_estac_reg_resto',
} as const;

export const RESTAURANTES_FILE = 'EE_indice_actividad_restaurante';

const COVERAGE_CABA = 'Ciudad Autónoma de Buenos Aires';
const IPCBA_UNIT = 'Índice base 2021=100';

/** Divisiones (13, clasificación COICOP 2018 adaptada) y grupo de comidas fuera del hogar. */
export const IPCBA_APERTURAS: ReadonlyArray<{ key: string; label: string; shortName: string; kind: 'division' | 'grupo' }> = [
  { key: 'alimentos_bebidas_no_alcoholicas', label: 'Alimentos y bebidas no alcohólicas', shortName: 'Alimentos y bebidas', kind: 'division' },
  { key: 'bebidas_alcoholicas_tabaco', label: 'Bebidas alcohólicas y tabaco', shortName: 'Bebidas alcohólicas y tabaco', kind: 'division' },
  { key: 'prendas_vestir_calzado', label: 'Prendas de vestir y calzado', shortName: 'Prendas y calzado', kind: 'division' },
  { key: 'vivienda_agua_electricidad_gas', label: 'Vivienda, agua, electricidad, gas y otros combustibles', shortName: 'Vivienda y servicios básicos', kind: 'division' },
  { key: 'equipamiento_mantenimiento_hogar', label: 'Equipamiento y mantenimiento del hogar', shortName: 'Equipamiento del hogar', kind: 'division' },
  { key: 'salud', label: 'Salud', shortName: 'Salud', kind: 'division' },
  { key: 'transporte', label: 'Transporte', shortName: 'Transporte', kind: 'division' },
  { key: 'informacion_comunicacion', label: 'Información y comunicación', shortName: 'Información y comunicación', kind: 'division' },
  { key: 'recreacion_cultura', label: 'Recreación y cultura', shortName: 'Recreación y cultura', kind: 'division' },
  { key: 'educacion', label: 'Educación', shortName: 'Educación', kind: 'division' },
  { key: 'restaurantes_hoteles', label: 'Restaurantes y hoteles', shortName: 'Restaurantes y hoteles', kind: 'division' },
  { key: 'seguros_servicios_financieros', label: 'Seguros y servicios financieros', shortName: 'Seguros y serv. financieros', kind: 'division' },
  { key: 'cuidado_personal_proteccion_social', label: 'Cuidado personal, protección social y otros productos', shortName: 'Cuidado personal y otros', kind: 'division' },
  { key: 'servicios_alimentos_bebidas_fuera_hogar', label: 'Servicios de alimentos y bebidas preparadas fuera del hogar', shortName: 'Comidas fuera del hogar', kind: 'grupo' },
];

const NIVEL_GENERAL = 'Nivel General';

// ------------------------------------------------------------------ Utilidades de texto y período

/** NFC, sin NBSP, espacios colapsados, sin bordes. */
export function normText(s: string): string {
  return s.normalize('NFC').replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function fold(s: string): string {
  return normText(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** Nombre de mes en español (sin importar mayúsculas/acentos) → 1..12, o null. */
export function spanishMonth(name: string): number | null {
  return MONTHS[fold(name)] ?? null;
}

function period(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function nextMonth(p: string): string {
  const y = Number(p.slice(0, 4));
  const m = Number(p.slice(5, 7));
  return m === 12 ? period(y + 1, 1) : period(y, m + 1);
}

function prevMonth(p: string, n = 1): string {
  let y = Number(p.slice(0, 4));
  let m = Number(p.slice(5, 7)) - n;
  while (m < 1) { m += 12; y -= 1; }
  return period(y, m);
}

/**
 * Extrae el rango "<Mes> [de] <año> / <Mes> [de] <año>" del final de un título.
 * Ej.: "… Julio de 2012 / octubre de 2026", "… Marzo 2015 / Septiembre 2026."
 */
export function parseTitleRange(title: string): { first: string; last: string } | null {
  const m = /([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\s+(?:de\s+)?(\d{4})\s*\/\s*([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\s+(?:de\s+)?(\d{4})\s*\.?\s*$/.exec(normText(title));
  if (!m) return null;
  const m1 = spanishMonth(m[1]!);
  const m2 = spanishMonth(m[3]!);
  if (!m1 || !m2) return null;
  return { first: period(Number(m[2]), m1), last: period(Number(m[4]), m2) };
}

function isBlank(v: CellValue): boolean {
  return v === null || (typeof v === 'string' && normText(v) === '');
}

function where(sheet: XlsxSheet, row: number, col: number): string {
  return `"${sheet.name}"!${cellRef(row, col)}`;
}

/** Celda fecha (serial de Excel) → período mensual. Exige día 1 y hora 0. */
function monthFromSerial(v: CellValue, ctx: string, date1904: boolean): string {
  if (typeof v !== 'number') throw new Error(`IDECBA: se esperaba una fecha en ${ctx} y hay ${JSON.stringify(v)}`);
  if (v < 1 || v > 2_958_465) throw new Error(`IDECBA: fecha fuera de rango en ${ctx} (${v})`);
  const d = excelSerialToDate(v, date1904);
  if (d.getUTCDate() !== 1 || d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0) {
    throw new Error(`IDECBA: la fecha de ${ctx} (${d.toISOString().slice(0, 10)}) no es el primer día del mes`);
  }
  return period(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

export interface ParsedValue {
  value: number | null;
  flags: ObservationFlag[];
}

/**
 * Valor de celda con signos convencionales del IDECBA.
 *  - número → valor (sin redondear)
 *  - "///" → null, `no_corresponde` ("Dato que no corresponde presentar")
 *  - "..." → null, `no_disponible`
 *  - "-"   → null, `no_disponible`. En los archivos del IDECBA analizados "-" no está definido
 *            en las notas y se usa para variaciones que no pueden calcularse (falta el período
 *            base); NO es cero absoluto, por eso no se convierte en 0.
 *  - "123,4*" / "123.4*" → número + `provisorio`
 * Cualquier otra cosa (incluida la celda vacía) → error.
 */
export function parseMarkedValue(raw: CellValue, ctx: string): ParsedValue {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) throw new Error(`IDECBA: número inválido en ${ctx}`);
    return { value: raw, flags: [] };
  }
  if (raw === null || typeof raw === 'boolean') throw new Error(`IDECBA: celda vacía o inválida en ${ctx}`);
  const s = normText(raw);
  if (s === '') throw new Error(`IDECBA: celda vacía en ${ctx}`);
  if (s === '///') return { value: null, flags: ['no_corresponde'] };
  if (s === '...' || s === '…') return { value: null, flags: ['no_disponible'] };
  if (s === '-' || s === '–' || s === '—') return { value: null, flags: ['no_disponible'] };
  const m = /^(-?\d+(?:[.,]\d+)?)\s*(\*?)$/.exec(s);
  if (m) {
    const n = Number(m[1]!.replace(',', '.'));
    return { value: n, flags: m[2] ? ['provisorio'] : [] };
  }
  throw new Error(`IDECBA: valor no reconocido ${JSON.stringify(s)} en ${ctx}`);
}

function obs(p: string, v: ParsedValue, rawNote?: string): Observation {
  const o: Observation = { period: p, value: v.value };
  if (v.flags.length) o.flags = [...v.flags];
  if (rawNote) o.rawNote = rawNote;
  return o;
}

function assertConsecutive(periods: string[], ctx: string): void {
  for (let i = 1; i < periods.length; i++) {
    const expected = nextMonth(periods[i - 1]!);
    if (periods[i] !== expected) {
      throw new Error(`IDECBA: ${ctx}: se esperaba ${expected} después de ${periods[i - 1]} y hay ${periods[i]} (orden o huecos inesperados)`);
    }
  }
}

function assertTitle(sheet: XlsxSheet, row: number, col: number, fragments: string[], label: string): { first: string; last: string; title: string } {
  const raw = sheet.value(row, col);
  if (typeof raw !== 'string') throw new Error(`IDECBA ${label}: falta el título en ${where(sheet, row, col)}`);
  const title = normText(raw);
  const folded = fold(title).replace(/\s*=\s*/g, '=');
  for (const f of fragments) {
    if (!folded.includes(fold(f).replace(/\s*=\s*/g, '='))) {
      throw new Error(`IDECBA ${label}: el título no contiene "${f}" (layout cambiado): "${title}"`);
    }
  }
  const range = parseTitleRange(title);
  if (!range) throw new Error(`IDECBA ${label}: el título no termina con el período "<mes> <año> / <mes> <año>": "${title}"`);
  return { ...range, title };
}

function assertRangeMatches(range: { first: string; last: string }, periods: string[], label: string): void {
  const first = periods[0];
  const last = periods[periods.length - 1];
  if (first !== range.first || last !== range.last) {
    throw new Error(`IDECBA ${label}: el título indica ${range.first} a ${range.last} pero los datos van de ${first} a ${last}`);
  }
}

function expectText(sheet: XlsxSheet, row: number, col: number, expected: (s: string) => boolean, desc: string, label: string): string {
  const v = sheet.value(row, col);
  const s = typeof v === 'string' ? normText(v) : '';
  if (!expected(s)) throw new Error(`IDECBA ${label}: se esperaba ${desc} en ${where(sheet, row, col)} y hay ${JSON.stringify(v)}`);
  return s;
}

const startsWithIndice = (s: string) => fold(s).startsWith('indice');

// ------------------------------------------------------------------ IPCBA: parsers

export interface ParsedFeedPart {
  series: Record<string, Observation[]>;
  first: string;
  last: string;
  title: string;
}

/**
 * Lee un bloque vertical: columna A = fecha (serial de Excel), filas desde `startRow`.
 * Termina en la primera fila sin fecha; después solo puede haber notas (texto en A).
 */
function readVerticalDates(sheet: XlsxSheet, startRow: number, label: string, date1904: boolean): Array<{ row: number; period: string }> {
  const out: Array<{ row: number; period: string }> = [];
  let ended = false;
  for (let r = startRow; r <= sheet.maxRow; r++) {
    const a = sheet.value(r, 1);
    if (typeof a === 'number') {
      if (ended) throw new Error(`IDECBA ${label}: hay una fila con fecha (${where(sheet, r, 1)}) después de las notas al pie`);
      out.push({ row: r, period: monthFromSerial(a, `${label} ${where(sheet, r, 1)}`, date1904) });
      continue;
    }
    if (!out.length) {
      throw new Error(`IDECBA ${label}: se esperaba la primera fecha en ${where(sheet, r, 1)} y hay ${JSON.stringify(a)}`);
    }
    for (let c = 2; c <= sheet.maxCol; c++) {
      if (!isBlank(sheet.value(r, c))) throw new Error(`IDECBA ${label}: fila ${r} con valores y sin fecha (${where(sheet, r, c)})`);
    }
    ended = true;
  }
  if (!out.length) throw new Error(`IDECBA ${label}: no hay filas de datos`);
  assertConsecutive(out.map(o => o.period), label);
  return out;
}

/** `IPCBA_base_2021100-Nivel_general_empalme`: A = fecha, B = índice; datos desde la fila 5. */
export function parseIpcbaNivelGeneral(wb: XlsxWorkbook): ParsedFeedPart {
  const label = 'IPCBA nivel general empalmado';
  const sheet = wb.sheet('Nivel_general_empalme');
  const t = assertTitle(sheet, 1, 1, ['IPCBA (base 2021 = 100)', 'Nivel General', 'empalmado'], label);
  expectText(sheet, 3, 1, s => fold(s) === 'mes', '"Mes"', label);
  expectText(sheet, 3, 2, startsWithIndice, '"Índice…"', label);
  expectText(sheet, 4, 2, s => fold(s) === fold(NIVEL_GENERAL), `"${NIVEL_GENERAL}"`, label);
  const rows = readVerticalDates(sheet, 5, label, wb.date1904);
  const values = rows.map(({ row, period: p }) => {
    const v = parseMarkedValue(sheet.value(row, 2), `${label} ${where(sheet, row, 2)}`);
    for (let c = 3; c <= sheet.maxCol; c++) {
      if (!isBlank(sheet.value(row, c))) throw new Error(`IDECBA ${label}: columna inesperada con datos en ${where(sheet, row, c)}`);
    }
    return obs(p, v);
  });
  const periods = rows.map(r => r.period);
  assertRangeMatches(t, periods, label);
  return { series: { nivel_general: values }, first: periods[0]!, last: periods[periods.length - 1]!, title: t.title };
}

/**
 * `IPCBA_base_2021100-Principales_aperturas_indices`: formato ancho.
 * Fila 3 = fechas (desde B), col A = nombre de la apertura (desde la fila 4).
 * Devuelve las keys de IPCBA_APERTURAS más `nivel_general` (para validación cruzada).
 */
export function parseIpcbaAperturas(wb: XlsxWorkbook): ParsedFeedPart {
  const label = 'IPCBA principales aperturas';
  const sheet = wb.sheet('Principales_aperturas_indices');
  const t = assertTitle(sheet, 1, 1, ['IPCBA (base 2021 = 100)', 'principales aperturas'], label);
  expectText(sheet, 2, 1, s => fold(s) === 'apertura', '"Apertura"', label);
  expectText(sheet, 2, 2, startsWithIndice, '"Índice…"', label);
  if (!isBlank(sheet.value(3, 1))) throw new Error(`IDECBA ${label}: se esperaba ${where(sheet, 3, 1)} vacía (fila de fechas)`);

  const cols: Array<{ col: number; period: string }> = [];
  for (let c = 2; c <= sheet.maxCol; c++) {
    const v = sheet.value(3, c);
    if (isBlank(v)) {
      for (let c2 = c + 1; c2 <= sheet.maxCol; c2++) {
        if (!isBlank(sheet.value(3, c2))) throw new Error(`IDECBA ${label}: columna de fecha vacía en ${where(sheet, 3, c)}`);
      }
      break;
    }
    cols.push({ col: c, period: monthFromSerial(v, `${label} ${where(sheet, 3, c)}`, wb.date1904) });
  }
  if (!cols.length) throw new Error(`IDECBA ${label}: no hay fechas en la fila 3`);
  const periods = cols.map(c => c.period);
  assertConsecutive(periods, label);
  assertRangeMatches(t, periods, label);
  const lastCol = cols[cols.length - 1]!.col;

  const rowsByName = new Map<string, number>();
  for (let r = 4; r <= sheet.maxRow; r++) {
    const a = sheet.value(r, 1);
    const hasData = cols.some(({ col }) => !isBlank(sheet.value(r, col)));
    if (!hasData) {
      // Fin de la tabla: lo que sigue son notas al pie, sin datos.
      for (let r2 = r; r2 <= sheet.maxRow; r2++) {
        for (let c = 2; c <= lastCol; c++) {
          if (!isBlank(sheet.value(r2, c))) throw new Error(`IDECBA ${label}: hay datos después de las notas al pie (${where(sheet, r2, c)})`);
        }
      }
      break;
    }
    if (typeof a !== 'string' || isBlank(a)) throw new Error(`IDECBA ${label}: fila ${r} con datos y sin nombre de apertura`);
    for (let c = lastCol + 1; c <= sheet.maxCol; c++) {
      if (!isBlank(sheet.value(r, c))) throw new Error(`IDECBA ${label}: dato fuera de la tabla en ${where(sheet, r, c)} (columna sin fecha)`);
    }
    const name = fold(a);
    if (rowsByName.has(name)) throw new Error(`IDECBA ${label}: apertura duplicada "${normText(a)}"`);
    rowsByName.set(name, r);
  }
  const firstName = [...rowsByName.entries()].find(([, r]) => r === 4)?.[0];
  if (firstName !== fold(NIVEL_GENERAL)) throw new Error(`IDECBA ${label}: la primera apertura (fila 4) debería ser "${NIVEL_GENERAL}"`);

  const wanted = [{ key: 'nivel_general', label: NIVEL_GENERAL }, ...IPCBA_APERTURAS];
  const series: Record<string, Observation[]> = {};
  for (const w of wanted) {
    const r = rowsByName.get(fold(w.label));
    if (r === undefined) throw new Error(`IDECBA ${label}: falta la apertura "${w.label}" (¿cambió el nombre o el layout?)`);
    series[w.key] = cols.map(({ col, period: p }) => obs(p, parseMarkedValue(sheet.value(r, col), `${label} ${where(sheet, r, col)}`)));
  }
  return { series, first: periods[0]!, last: periods[periods.length - 1]!, title: t.title };
}

/**
 * Hojas `Evol_gral_*`: A = fecha (desde la fila 5); bloque "Índice" (B…) y bloque
 * "Variación porcentual" con los mismos encabezados en la fila 4. La variación publicada
 * (redondeada a 1 decimal) se usa solo para validar los índices.
 */
function parseIpcbaEvolucion(
  wb: XlsxWorkbook,
  sheetName: string,
  titleFragments: string[],
  columns: Record<string, string>,
  label: string,
): ParsedFeedPart {
  const sheet = wb.sheet(sheetName);
  const t = assertTitle(sheet, 1, 1, ['IPCBA (base 2021 = 100)', ...titleFragments], label);
  expectText(sheet, 3, 1, s => fold(s) === 'mes', '"Mes"', label);
  expectText(sheet, 3, 2, startsWithIndice, '"Índice…"', label);
  let varCol = -1;
  for (let c = 3; c <= sheet.maxCol; c++) {
    const v = sheet.value(3, c);
    if (typeof v === 'string' && fold(v) === 'variacion porcentual') { varCol = c; break; }
    if (!isBlank(v)) throw new Error(`IDECBA ${label}: encabezado inesperado en ${where(sheet, 3, c)}: ${JSON.stringify(v)}`);
  }
  if (varCol < 0) throw new Error(`IDECBA ${label}: no se encontró el bloque "Variación porcentual" en la fila 3`);
  const width = varCol - 2;
  const expectedNames = Object.keys(columns);
  if (width !== expectedNames.length) {
    throw new Error(`IDECBA ${label}: se esperaban ${expectedNames.length} columnas de índice y hay ${width}`);
  }
  const keyByCol = new Map<number, string>();
  for (let i = 0; i < width; i++) {
    const idx = expectText(sheet, 4, 2 + i, s => s !== '', 'un encabezado', label);
    const vr = expectText(sheet, 4, varCol + i, s => s !== '', 'un encabezado', label);
    if (fold(idx) !== fold(vr)) throw new Error(`IDECBA ${label}: los encabezados de índice ("${idx}") y variación ("${vr}") no coinciden`);
    const name = expectedNames.find(n => fold(n) === fold(idx));
    if (!name) throw new Error(`IDECBA ${label}: encabezado inesperado "${idx}" (se esperaban: ${expectedNames.join(', ')})`);
    keyByCol.set(2 + i, columns[name]!);
  }
  if (new Set(keyByCol.values()).size !== expectedNames.length) throw new Error(`IDECBA ${label}: encabezados repetidos en la fila 4`);

  const rows = readVerticalDates(sheet, 5, label, wb.date1904);
  const periods = rows.map(r => r.period);
  assertRangeMatches(t, periods, label);
  const series: Record<string, Observation[]> = {};
  for (const [col, key] of keyByCol) {
    const values = rows.map(({ row, period: p }) => obs(p, parseMarkedValue(sheet.value(row, col), `${label} ${where(sheet, row, col)}`)));
    rows.forEach(({ row }, i) => {
      const ctx = `${label} ${where(sheet, row, varCol + col - 2)}`;
      const published = parseMarkedValue(sheet.value(row, varCol + col - 2), ctx).value;
      const cur = values[i]!.value;
      const prev = i > 0 ? values[i - 1]!.value : null;
      if (cur === null || prev === null) {
        if (published !== null) throw new Error(`IDECBA ${label}: ${ctx} tiene variación publicada sin índices para calcularla`);
        return;
      }
      if (published === null) throw new Error(`IDECBA ${label}: falta la variación publicada en ${ctx}`);
      const computed = (cur / prev - 1) * 100;
      if (Math.abs(computed - published) > 0.06) {
        throw new Error(`IDECBA ${label}: la variación calculada (${computed.toFixed(3)}%) no coincide con la publicada (${published}%) en ${ctx}`);
      }
    });
    series[key] = values;
  }
  return { series, first: periods[0]!, last: periods[periods.length - 1]!, title: t.title };
}

export function parseIpcbaBienesServicios(wb: XlsxWorkbook): ParsedFeedPart {
  return parseIpcbaEvolucion(
    wb,
    'Evol_gral_bs_svcios',
    ['bienes', 'servicios'],
    { [NIVEL_GENERAL]: 'nivel_general', Bienes: 'bienes', Servicios: 'servicios' },
    'IPCBA bienes y servicios',
  );
}

export function parseIpcbaEstacionalesRegulados(wb: XlsxWorkbook): ParsedFeedPart {
  return parseIpcbaEvolucion(
    wb,
    'Evol_gral_estac_reg_resto',
    ['estacionales', 'regulados', 'resto IPCBA'],
    { [NIVEL_GENERAL]: 'nivel_general', Estacionales: 'estacionales', Regulados: 'regulados', 'Resto IPCBA': 'resto_ipcba' },
    'IPCBA estacionales, regulados y resto',
  );
}

export interface IpcbaParts {
  nivelGeneral: ParsedFeedPart;
  aperturas: ParsedFeedPart;
  bienesServicios: ParsedFeedPart;
  estacionalesRegulados: ParsedFeedPart;
}

/**
 * Combina las cuatro hojas. Exige el mismo último período en todas (si no, es probable que la
 * publicación esté en curso) y que el nivel general coincida en todos los meses comunes.
 */
export function combineIpcba(parts: IpcbaParts): Record<string, Observation[]> {
  const entries = Object.entries(parts) as Array<[keyof IpcbaParts, ParsedFeedPart]>;
  const lasts = new Set(entries.map(([, p]) => p.last));
  if (lasts.size !== 1) {
    throw new Error(
      `IDECBA IPCBA: los archivos no están sincronizados (último período: ${entries.map(([k, p]) => `${k}=${p.last}`).join(', ')}); posible publicación en curso`,
    );
  }
  const ref = new Map(parts.nivelGeneral.series.nivel_general!.map(o => [o.period, o.value]));
  for (const [name, part] of entries) {
    if (name === 'nivelGeneral') continue;
    const ng = part.series.nivel_general;
    if (!ng?.length) throw new Error(`IDECBA IPCBA: ${name} no trae nivel general para validar`);
    let common = 0;
    for (const o of ng) {
      if (!ref.has(o.period)) continue;
      common++;
      const a = ref.get(o.period)!;
      const b = o.value;
      if (a === null || b === null ? a !== b : Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a))) {
        throw new Error(`IDECBA IPCBA: el nivel general no coincide entre hojas en ${o.period} (empalme=${a}, ${name}=${b})`);
      }
    }
    if (common === 0) throw new Error(`IDECBA IPCBA: ${name} no tiene meses en común con el nivel general empalmado`);
  }
  const out: Record<string, Observation[]> = { nivel_general: parts.nivelGeneral.series.nivel_general! };
  for (const k of ['bienes', 'servicios'] as const) out[k] = parts.bienesServicios.series[k]!;
  for (const k of ['estacionales', 'regulados', 'resto_ipcba'] as const) out[k] = parts.estacionalesRegulados.series[k]!;
  for (const a of IPCBA_APERTURAS) out[a.key] = parts.aperturas.series[a.key]!;
  return out;
}

const IPCBA_COMMON_NOTES = [
  'IPCBA (IDECBA), base 2021=100, Ciudad Autónoma de Buenos Aires: no es comparable 1:1 con el IPC nacional del INDEC (distinta canasta, ponderaciones y cobertura).',
  'Series en niveles sin desestacionalizar; la variación mensual se calcula sobre estos índices.',
];

export function ipcbaInfo(aperturasFirst = '2022-02'): FeedSeriesInfo[] {
  const base = (key: string, name: string, shortName: string, notes: string[]): FeedSeriesInfo => ({
    key, name, shortName, unit: IPCBA_UNIT, base: '2021=100', measure: 'index', coverage: COVERAGE_CABA,
    notes: [...IPCBA_COMMON_NOTES, ...notes],
  });
  return [
    base('nivel_general', 'IPCBA – Nivel general (serie empalmada)', 'Nivel general', [
      `Serie empalmada por el IDECBA con el IPCBA base julio 2011–junio 2012=100; los meses anteriores a ${aperturasFirst} provienen del empalme con la serie anterior (por eso el promedio 2021 no es exactamente 100).`,
    ]),
    base('bienes', 'IPCBA – Bienes', 'Bienes', []),
    base('servicios', 'IPCBA – Servicios', 'Servicios', []),
    base('estacionales', 'IPCBA – Estacionales', 'Estacionales', ['Agrupamiento analítico del IDECBA (bienes y servicios con comportamiento estacional).']),
    base('regulados', 'IPCBA – Regulados', 'Regulados', ['Agrupamiento analítico del IDECBA (precios regulados o con fuerte componente impositivo).']),
    base('resto_ipcba', 'IPCBA – Resto IPCBA', 'Resto IPCBA', ['Nivel general sin estacionales ni regulados. Agrupamiento propio del IDECBA: no equivale exactamente al IPC Núcleo del INDEC.']),
    ...IPCBA_APERTURAS.map(a =>
      base(a.key, `IPCBA – ${a.label}`, a.shortName, [
        a.kind === 'division'
          ? 'División del IPCBA (13 divisiones, clasificación COICOP 2018 adaptada); no se corresponde 1:1 con las 12 divisiones del IPC INDEC.'
          : 'Grupo de la división "Restaurantes y hoteles".',
      ]),
    ),
  ];
}

// ------------------------------------------------------------------ Restaurantes: parser

const RESTAURANTES_NOTES = [
  'Índice de volumen físico elaborado con la cantidad de cubiertos vendidos en restaurantes tradicionales de la Ciudad de Buenos Aires; excluye bares y otros establecimientos con servicio de mesas no contemplados como tradicionales (encuesta EREST).',
  'Serie original, sin desestacionalizar: comparar contra el mismo mes del año anterior (variación interanual); la variación mensual está dominada por la estacionalidad.',
  'Abril a octubre de 2020 sin dato ("///"): no corresponde presentar por el cierre de establecimientos (ASPO, DNU 297/2020). Marzo 2020 refleja el cierre desde el día 20.',
  'Los últimos meses se publican como provisorios (*) y pueden revisarse.',
];

export function restaurantesInfo(): FeedSeriesInfo[] {
  return [{
    key: 'indice_actividad',
    name: 'Actividad en restaurantes tradicionales (CABA) – Índice de volumen físico',
    shortName: 'Actividad en restaurantes',
    unit: 'Índice base marzo 2015=100',
    base: 'marzo 2015=100',
    measure: 'index',
    coverage: `Restaurantes tradicionales de la ${COVERAGE_CABA} (excluye bares)`,
    notes: RESTAURANTES_NOTES,
  }];
}

interface RestRow {
  row: number;
  period: string;
  index: ParsedValue;
  mom: ParsedValue;
  yoy: ParsedValue;
  footnotes: string[];
}

/**
 * `EE_indice_actividad_restaurante` (primera hoja). Col B = año o mes en español
 * ("Septiembre*", "Marzo*1"), C = índice, D = var. m/m, E = var. i.a.; bloques por año en
 * orden descendente, filas vacías intercaladas y notas al pie. Solo se guarda el índice;
 * D y E se usan para validar.
 */
export function parseRestaurantes(wb: XlsxWorkbook): ParsedFeedPart {
  const label = 'IDECBA restaurantes';
  const sheet = wb.sheetAt(0);

  // Encabezados: buscar "Período" en las primeras filas.
  let hr = -1;
  let hc = -1;
  for (let r = 1; r <= Math.min(10, sheet.maxRow) && hr < 0; r++) {
    for (let c = 1; c <= sheet.maxCol; c++) {
      const v = sheet.value(r, c);
      if (typeof v === 'string' && fold(v) === 'periodo') { hr = r; hc = c; break; }
    }
  }
  if (hr < 0) throw new Error(`${label}: no se encontró el encabezado "Período" en las primeras 10 filas (layout cambiado)`);
  const [cP, cI, cM, cY] = [hc, hc + 1, hc + 2, hc + 3];
  expectText(sheet, hr, cI, s => fold(s) === 'indice', '"índice"', label);
  expectText(sheet, hr, cM, s => fold(s) === 'variacion intermensual', '"variación intermensual"', label);
  expectText(sheet, hr, cY, s => fold(s) === 'variacion interanual', '"variación interanual"', label);
  let titleRow = -1;
  for (let r = 1; r < hr; r++) if (typeof sheet.value(r, cP) === 'string') titleRow = r;
  if (titleRow < 0) throw new Error(`${label}: falta el título sobre los encabezados`);
  const t = assertTitle(
    sheet,
    titleRow,
    cP,
    ['Actividad en Restaurantes tradicionales', 'Índice de volumen físico', 'Base marzo 2015 = 100', 'Ciudad Autónoma de Buenos Aires'],
    label,
  );

  const raw: RestRow[] = [];
  const notes: string[] = [];
  let year: number | null = null;
  let lastMonthInYear = 13;
  let inNotes = false;
  for (let r = hr + 1; r <= sheet.maxRow; r++) {
    const b = sheet.value(r, cP);
    const rest = [cI, cM, cY].map(c => sheet.value(r, c));
    const restBlank = rest.every(isBlank);
    if (isBlank(b)) {
      if (!restBlank) throw new Error(`${label}: fila ${r} con valores y sin período`);
      continue;
    }
    const isYear = typeof b === 'number' || (typeof b === 'string' && /^\d{4}$/.test(normText(b)));
    if (isYear) {
      const y = Number(typeof b === 'string' ? normText(b) : b);
      if (inNotes) throw new Error(`${label}: año ${y} después de las notas al pie (fila ${r})`);
      if (!Number.isInteger(y) || y < 1990 || y > 2200) throw new Error(`${label}: año inválido en ${where(sheet, r, cP)}: ${b}`);
      if (!restBlank) throw new Error(`${label}: la fila del año ${y} (fila ${r}) tiene valores`);
      if (year !== null && y !== year - 1) throw new Error(`${label}: los años deberían ir en orden descendente consecutivo (${year} → ${y}, fila ${r})`);
      if (year !== null && lastMonthInYear !== 1) throw new Error(`${label}: el año ${year} no termina en enero (orden o huecos inesperados)`);
      year = y;
      lastMonthInYear = 13;
      continue;
    }
    const text = normText(String(b));
    const mm = /^([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\s*(\*?)\s*(\d*)$/.exec(text);
    const month = mm ? spanishMonth(mm[1]!) : null;
    if (mm && month) {
      if (inNotes) throw new Error(`${label}: fila de datos (${text}) después de las notas al pie (fila ${r})`);
      if (year === null) throw new Error(`${label}: mes "${text}" sin año previo (fila ${r})`);
      if (lastMonthInYear !== 13 && month !== lastMonthInYear - 1) {
        throw new Error(`${label}: meses fuera de orden descendente en ${year} (${lastMonthInYear} → ${month}, fila ${r})`);
      }
      lastMonthInYear = month;
      const p = period(year, month);
      const index = parseMarkedValue(rest[0]!, `${label} ${where(sheet, r, cI)}`);
      if (mm[2]) index.flags = [...index.flags.filter(f => f !== 'provisorio'), 'provisorio'];
      raw.push({
        row: r,
        period: p,
        index,
        mom: parseMarkedValue(rest[1]!, `${label} ${where(sheet, r, cM)}`),
        yoy: parseMarkedValue(rest[2]!, `${label} ${where(sheet, r, cY)}`),
        footnotes: mm[3] ? mm[3].split('') : [],
      });
      continue;
    }
    // Notas al pie.
    if (!restBlank) throw new Error(`${label}: texto inesperado "${text}" con valores en la fila ${r}`);
    if (!raw.length) throw new Error(`${label}: texto inesperado "${text}" antes de los datos (fila ${r})`);
    inNotes = true;
    notes.push(text);
  }
  if (!raw.length) throw new Error(`${label}: no hay datos`);

  // Notas: "*" provisorio, "///" no corresponde, "1 …" llamadas numeradas.
  const footnoteText = new Map<string, string>();
  for (const n of notes) {
    const m = /^(\d)\s+(.+)$/.exec(n);
    if (m) footnoteText.set(m[1]!, n);
  }
  const usesProv = raw.some(x => x.index.flags.includes('provisorio'));
  if (usesProv && !notes.some(n => /^\*\s*datos provisorios/i.test(n))) throw new Error(`${label}: se usa "*" pero falta la nota "* datos provisorios"`);
  const usesNc = raw.some(x => x.index.flags.includes('no_corresponde'));
  if (usesNc && !notes.some(n => n.startsWith('///'))) throw new Error(`${label}: se usa "///" pero falta la nota que lo define`);
  for (const x of raw) {
    for (const f of x.footnotes) {
      if (!footnoteText.has(f)) throw new Error(`${label}: la llamada "${f}" de ${x.period} no tiene nota al pie`);
    }
  }

  const rows = [...raw].reverse(); // ascendente
  const periods = rows.map(x => x.period);
  if (new Set(periods).size !== periods.length) throw new Error(`${label}: períodos duplicados`);
  assertConsecutive(periods, label);
  assertRangeMatches(t, periods, label);
  const base = rows.find(x => x.period === '2015-03');
  if (!base || base.index.value === null || Math.abs(base.index.value - 100) > 1e-9) {
    throw new Error(`${label}: el índice de marzo 2015 debería ser 100 (base marzo 2015=100)`);
  }

  // Validación con las variaciones publicadas (D, E).
  const byPeriod = new Map(rows.map(x => [x.period, x]));
  // p.p. Las variaciones vienen sin redondear, pero algunos índices están cargados con 1 decimal
  // (p.ej. 2025-04 = 162,9) y la variación publicada se calculó con el valor sin redondear:
  // diferencias observadas de hasta 0,03 p.p. Un desplazamiento de columnas da varios p.p.
  const TOL = 0.05;
  const check = (x: RestRow, kind: 'mom' | 'yoy') => {
    const prev = byPeriod.get(prevMonth(x.period, kind === 'mom' ? 1 : 12));
    const published = x[kind].value;
    const cur = x.index.value;
    const base0 = prev?.index.value ?? null;
    const ctx = `${label} ${x.period} (variación ${kind === 'mom' ? 'intermensual' : 'interanual'})`;
    if (cur === null || base0 === null) {
      if (published !== null) throw new Error(`${ctx}: hay variación publicada (${published}) pero no índices para calcularla`);
      return;
    }
    if (published === null) throw new Error(`${ctx}: falta la variación publicada aunque hay índices`);
    const computed = (cur / base0 - 1) * 100;
    if (Math.abs(computed - published) > TOL) {
      throw new Error(`${ctx}: la variación calculada (${computed.toFixed(4)}%) no coincide con la publicada (${published.toFixed(4)}%)`);
    }
  };
  for (const x of rows) { check(x, 'mom'); check(x, 'yoy'); }

  const series = {
    indice_actividad: rows.map(x => obs(x.period, x.index, x.footnotes.map(f => footnoteText.get(f)!).join(' ') || undefined)),
  };
  return { series, first: periods[0]!, last: periods[periods.length - 1]!, title: t.title };
}

// ------------------------------------------------------------------ Red

export function idecbaSlug(file: string): string {
  return file.replace(/\.xlsx$/i, '').toLowerCase();
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function fetchWithRetry(url: string, init: RequestInit, opts: IdecbaFetchOptions, what: string): Promise<Response> {
  const f = opts.fetch ?? fetch;
  const retries = opts.retries ?? 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await f(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000) });
      if (res.ok) return res;
      const err = new Error(`IDECBA: HTTP ${res.status} al descargar ${what}`);
      if (!isRetryable(res.status)) throw Object.assign(err, { fatal: true });
      lastError = err;
    } catch (error) {
      if ((error as { fatal?: boolean }).fatal) throw error;
      lastError = error;
    }
    if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 500 * 3 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(`IDECBA: no se pudo descargar ${what}`);
}

/** Resuelve la URL vigente de un archivo por slug (API de medios de WordPress). */
export async function resolveIdecbaFile(file: string, opts: IdecbaFetchOptions = {}): Promise<FeedSourceFile> {
  const slug = idecbaSlug(file);
  const url = `${IDECBA_MEDIA_API}?slug=${encodeURIComponent(slug)}&_fields=source_url,modified,slug`;
  const res = await fetchWithRetry(url, { headers: { Accept: 'application/json' } }, opts, `la ficha de medios "${slug}"`);
  let body: unknown;
  try { body = await res.json(); } catch { throw new Error(`IDECBA: la API de medios no devolvió JSON para "${slug}"`); }
  if (!Array.isArray(body)) throw new Error(`IDECBA: respuesta inesperada de la API de medios para "${slug}"`);
  const candidates = body
    .filter((m): m is { source_url: string; modified: string; slug?: string } =>
      !!m && typeof m === 'object' && typeof (m as { source_url?: unknown }).source_url === 'string' && typeof (m as { modified?: unknown }).modified === 'string')
    .filter(m => m.slug === undefined || m.slug === slug);
  if (!candidates.length) throw new Error(`IDECBA: no se encontró el archivo "${file}" (slug "${slug}") en la API de medios`);
  candidates.sort((a, b) => Date.parse(b.modified) - Date.parse(a.modified));
  const best = candidates[0]!;
  let parsed: URL;
  try { parsed = new URL(best.source_url); } catch { throw new Error(`IDECBA: URL inválida para "${slug}": ${best.source_url}`); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== new URL(IDECBA_SITE).hostname || !/\.xlsx$/i.test(parsed.pathname)) {
    throw new Error(`IDECBA: URL inesperada para "${slug}": ${best.source_url}`);
  }
  if (!Number.isFinite(Date.parse(best.modified))) throw new Error(`IDECBA: fecha "modified" inválida para "${slug}"`);
  return { file, slug, url: parsed.toString(), modified: best.modified };
}

const MAX_XLSX_BYTES = 30 * 1024 * 1024;

export async function downloadIdecbaXlsx(file: string, opts: IdecbaFetchOptions = {}): Promise<{ source: FeedSourceFile; workbook: XlsxWorkbook }> {
  const source = await resolveIdecbaFile(file, opts);
  const res = await fetchWithRetry(source.url, {}, opts, `"${file}.xlsx"`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_XLSX_BYTES) throw new Error(`IDECBA: "${file}.xlsx" es demasiado grande (${bytes.length} bytes)`);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Error(`IDECBA: "${file}.xlsx" no es un XLSX válido (¿página de error?)`);
  }
  try {
    return { source, workbook: readXlsx(bytes) };
  } catch (error) {
    throw new Error(`IDECBA: no se pudo leer "${file}.xlsx": ${(error as Error).message}`);
  }
}

// ------------------------------------------------------------------ API pública

/** IPCBA (base 2021=100): nivel general empalmado, bienes/servicios, estacionales/regulados/resto, 13 divisiones y comidas fuera del hogar. */
export async function fetchIpcba(opts: IdecbaFetchOptions = {}): Promise<FeedResult> {
  const now = opts.now ?? (() => new Date());
  const [ng, ap, bs, er] = await Promise.all([
    downloadIdecbaXlsx(IPCBA_FILES.nivelGeneral, opts),
    downloadIdecbaXlsx(IPCBA_FILES.aperturas, opts),
    downloadIdecbaXlsx(IPCBA_FILES.bienesServicios, opts),
    downloadIdecbaXlsx(IPCBA_FILES.estacionalesRegulados, opts),
  ]);
  const parts: IpcbaParts = {
    nivelGeneral: parseIpcbaNivelGeneral(ng.workbook),
    aperturas: parseIpcbaAperturas(ap.workbook),
    bienesServicios: parseIpcbaBienesServicios(bs.workbook),
    estacionalesRegulados: parseIpcbaEstacionalesRegulados(er.workbook),
  };
  const series = combineIpcba(parts);
  return {
    feed: 'idecba_ipcba',
    sourceUrl: ng.source.url,
    retrievedAt: now().toISOString(),
    series,
    info: ipcbaInfo(parts.aperturas.first),
    files: [ng.source, ap.source, bs.source, er.source],
  };
}

/** Actividad en restaurantes tradicionales de CABA (EREST): índice de volumen físico, base marzo 2015=100. */
export async function fetchRestaurantes(opts: IdecbaFetchOptions = {}): Promise<FeedResult> {
  const now = opts.now ?? (() => new Date());
  const { source, workbook } = await downloadIdecbaXlsx(RESTAURANTES_FILE, opts);
  const parsed = parseRestaurantes(workbook);
  return {
    feed: 'idecba_restaurantes',
    sourceUrl: source.url,
    retrievedAt: now().toISOString(),
    series: parsed.series,
    info: restaurantesInfo(),
    files: [source],
  };
}
