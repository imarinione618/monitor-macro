/**
 * Lector XLSX mínimo y sin dependencias (solo `node:zlib`).
 *
 * Alcance: libros generados por Excel/LibreOffice con hojas de datos simples.
 *  - ZIP: lee el directorio central (no depende de los encabezados locales para tamaños),
 *    métodos 0 (stored) y 8 (deflate), verifica CRC-32. Sin ZIP64 ni cifrado.
 *  - Hojas: `xl/workbook.xml` + `xl/_rels/workbook.xml.rels` → nombre de hoja → `xl/worksheets/sheetN.xml`.
 *  - Celdas: `t="s"` (strings compartidas), `t="str"`, `t="inlineStr"`, `t="b"`, `t="e"`, `t="d"` y números.
 *    Para números se informa si el estilo de la celda es de fecha (`isDate`); la conversión del
 *    serial de Excel a fecha la hace `excelSerialToDate` (sistemas 1900 y 1904).
 *  - Se usan los valores cacheados (`<v>`) de las fórmulas; no se evalúan fórmulas.
 *
 * Solo servidor/CLI: usa `node:zlib`.
 */
import { inflateRawSync } from 'node:zlib';

// ------------------------------------------------------------------ ZIP

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
/** Límite defensivo por entrada descomprimida (evita "zip bombs"). */
const MAX_ENTRY_BYTES = 256 * 1024 * 1024;

export interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

let CRC_TABLE: Uint32Array | null = null;

/** CRC-32 (IEEE 802.3), el mismo que usa ZIP. */
export function crc32(data: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function toBytes(data: Uint8Array | ArrayBuffer): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/** Archivo ZIP leído desde el directorio central; las entradas se descomprimen bajo demanda. */
export class ZipArchive {
  readonly entries: Map<string, ZipEntry>;
  private readonly bytes: Uint8Array;
  private readonly view: DataView;

  constructor(data: Uint8Array | ArrayBuffer) {
    this.bytes = toBytes(data);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    this.entries = this.readCentralDirectory();
  }

  private readCentralDirectory(): Map<string, ZipEntry> {
    const { bytes, view } = this;
    if (bytes.length < 22) throw new Error('XLSX inválido: el archivo es demasiado chico para ser un ZIP');
    let eocd = -1;
    const stop = Math.max(0, bytes.length - 22 - 0xffff);
    for (let i = bytes.length - 22; i >= stop; i--) {
      if (view.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('XLSX inválido: no se encontró el directorio central del ZIP');
    const count = view.getUint16(eocd + 10, true);
    const cdSize = view.getUint32(eocd + 12, true);
    const cdOffset = view.getUint32(eocd + 16, true);
    if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      throw new Error('XLSX no soportado: ZIP64');
    }
    if (cdOffset + cdSize > eocd) throw new Error('XLSX inválido: directorio central fuera de rango');
    const entries = new Map<string, ZipEntry>();
    const decoder = new TextDecoder('utf-8');
    let p = cdOffset;
    for (let i = 0; i < count; i++) {
      if (p + 46 > bytes.length || view.getUint32(p, true) !== SIG_CENTRAL) {
        throw new Error('XLSX inválido: entrada del directorio central corrupta');
      }
      const flags = view.getUint16(p + 8, true);
      const method = view.getUint16(p + 10, true);
      const crc = view.getUint32(p + 16, true);
      const compressedSize = view.getUint32(p + 20, true);
      const uncompressedSize = view.getUint32(p + 24, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const localHeaderOffset = view.getUint32(p + 42, true);
      const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      if (entries.has(name)) throw new Error(`XLSX inválido: entrada ZIP duplicada "${name}"`);
      entries.set(name, { name, method, flags, crc32: crc, compressedSize, uncompressedSize, localHeaderOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  read(name: string): Uint8Array {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`XLSX: falta la parte "${name}"`);
    const { view, bytes } = this;
    if (entry.flags & 0x1) throw new Error(`XLSX no soportado: "${name}" está cifrado`);
    const lh = entry.localHeaderOffset;
    if (lh + 30 > bytes.length || view.getUint32(lh, true) !== SIG_LOCAL) {
      throw new Error(`XLSX inválido: encabezado local corrupto en "${name}"`);
    }
    const start = lh + 30 + view.getUint16(lh + 26, true) + view.getUint16(lh + 28, true);
    const end = start + entry.compressedSize;
    if (end > bytes.length) throw new Error(`XLSX inválido: "${name}" excede el tamaño del archivo`);
    if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new Error(`XLSX: "${name}" es demasiado grande`);
    const raw = bytes.subarray(start, end);
    let out: Uint8Array;
    if (entry.method === 0) out = raw;
    else if (entry.method === 8) {
      out = inflateRawSync(raw, { maxOutputLength: Math.max(entry.uncompressedSize, 1) });
    } else throw new Error(`XLSX no soportado: método de compresión ${entry.method} en "${name}"`);
    if (out.length !== entry.uncompressedSize) throw new Error(`XLSX inválido: tamaño inesperado en "${name}"`);
    if (crc32(out) !== entry.crc32) throw new Error(`XLSX inválido: CRC incorrecto en "${name}"`);
    return out;
  }

  readText(name: string): string {
    return new TextDecoder('utf-8').decode(this.read(name));
  }
}

// ------------------------------------------------------------------ XML mínimo

export interface XmlElement {
  /** Nombre con prefijo, p.ej. "x:c". */
  name: string;
  /** Nombre local sin prefijo, p.ej. "c". */
  local: string;
  attrs: Record<string, string>;
  children: Array<XmlElement | string>;
}

const ENTITY: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (_m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    const v = ENTITY[e];
    if (v === undefined) throw new Error(`XML: entidad desconocida &${e};`);
    return v;
  });
}

const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!([^>]*)>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/y;
const ATTR = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Parser XML mínimo (sin DTD ni entidades externas). Devuelve el elemento raíz. */
export function parseXml(xml: string, label = 'XML'): XmlElement {
  const root: XmlElement = { name: '#root', local: '#root', attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  TOKEN.lastIndex = 0;
  let pos = 0;
  if (xml.charCodeAt(0) === 0xfeff) pos = TOKEN.lastIndex = 1;
  while (pos < xml.length) {
    const m = TOKEN.exec(xml);
    if (!m) throw new Error(`${label}: XML mal formado cerca de la posición ${pos}`);
    pos = TOKEN.lastIndex;
    const top = stack[stack.length - 1]!;
    if (m[1] !== undefined) top.children.push(m[1]);
    else if (m[2] !== undefined) throw new Error(`${label}: declaraciones <!${m[2].slice(0, 20)}> no soportadas`);
    else if (m[3] !== undefined) {
      if (stack.length < 2 || top.name !== m[3]) throw new Error(`${label}: cierre </${m[3]}> inesperado`);
      stack.pop();
    } else if (m[4] !== undefined) {
      const attrs: Record<string, string> = {};
      const rawAttrs = m[5] ?? '';
      ATTR.lastIndex = 0;
      let a: RegExpExecArray | null;
      while ((a = ATTR.exec(rawAttrs))) attrs[a[1]!] = decodeEntities(a[2] ?? a[3] ?? '');
      const name = m[4];
      const colon = name.indexOf(':');
      const el: XmlElement = { name, local: colon >= 0 ? name.slice(colon + 1) : name, attrs, children: [] };
      top.children.push(el);
      if (m[6] !== '/') stack.push(el);
    } else if (m[7] !== undefined) {
      top.children.push(decodeEntities(m[7]));
    }
  }
  if (stack.length !== 1) throw new Error(`${label}: XML incompleto (falta cerrar <${stack[stack.length - 1]!.name}>)`);
  const el = root.children.find((c): c is XmlElement => typeof c !== 'string');
  if (!el) throw new Error(`${label}: XML sin elemento raíz`);
  return el;
}

export function childElements(el: XmlElement, local?: string): XmlElement[] {
  return el.children.filter((c): c is XmlElement => typeof c !== 'string' && (local === undefined || c.local === local));
}

export function firstChild(el: XmlElement, local: string): XmlElement | undefined {
  return childElements(el, local)[0];
}

export function textContent(el: XmlElement): string {
  let s = '';
  for (const c of el.children) s += typeof c === 'string' ? c : textContent(c);
  return s;
}

/** Atributo por nombre local (ignora el prefijo de espacio de nombres). */
function attrLocal(el: XmlElement, local: string): string | undefined {
  if (local in el.attrs) return el.attrs[local];
  for (const [k, v] of Object.entries(el.attrs)) if (k.endsWith(`:${local}`)) return v;
  return undefined;
}

/** Escapes OOXML `_xHHHH_` en textos de celdas. */
function decodeOoxmlEscapes(s: string): string {
  return s.includes('_x') ? s.replace(/_x([0-9A-Fa-f]{4})_/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))) : s;
}

/** Texto de un `<si>` / `<is>`: `<t>` directo o runs `<r><t>`; excluye fonética (`<rPh>`). */
function richText(el: XmlElement): string {
  let s = '';
  for (const c of childElements(el)) {
    if (c.local === 't') s += textContent(c);
    else if (c.local === 'r') for (const t of childElements(c, 't')) s += textContent(t);
  }
  return decodeOoxmlEscapes(s);
}

// ------------------------------------------------------------------ Celdas y fechas

export type CellValue = string | number | boolean | null;

export interface XlsxCell {
  ref: string;
  /** Fila 1-based. */
  row: number;
  /** Columna 1-based (A = 1). */
  col: number;
  type: 'string' | 'number' | 'boolean' | 'error';
  value: string | number | boolean;
  /** Número con formato de fecha (valor = serial de Excel). */
  isDate: boolean;
}

export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    const c = ch.charCodeAt(0) - 64;
    if (c < 1 || c > 26) throw new Error(`Columna inválida: ${letters}`);
    n = n * 26 + c;
  }
  return n;
}

export function columnLetters(col: number): string {
  let s = '';
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function cellRef(row: number, col: number): string {
  return `${columnLetters(col)}${row}`;
}

export function parseCellRef(ref: string): { row: number; col: number } {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref);
  if (!m) throw new Error(`Referencia de celda inválida: ${ref}`);
  return { col: columnIndex(m[1]!), row: Number(m[2]) };
}

const DAY_MS = 86_400_000;
const EPOCH_1900 = Date.UTC(1899, 11, 30);
const EPOCH_1904 = Date.UTC(1904, 0, 1);

/**
 * Serial de Excel → Date (UTC). Sistema 1900: respeta el bug del 29/02/1900
 * (seriales < 60 se corrigen un día). Sistema 1904 si `date1904`.
 */
export function excelSerialToDate(serial: number, date1904 = false): Date {
  if (!Number.isFinite(serial)) throw new Error(`Serial de fecha inválido: ${serial}`);
  if (date1904) return new Date(EPOCH_1904 + Math.round(serial * DAY_MS));
  const s = serial < 60 ? serial + 1 : serial;
  return new Date(EPOCH_1900 + Math.round(s * DAY_MS));
}

/** Date (UTC) → serial de Excel (sistema 1900, fechas posteriores a 1900-03-01). */
export function dateToExcelSerial(date: Date): number {
  return (date.getTime() - EPOCH_1900) / DAY_MS;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function isDateFormatCode(code: string): boolean {
  const stripped = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[(?:[hms]+)\]/gi, 'h')
    .replace(/\[[^\]]*\]/g, '');
  // La primera sección decide (las demás son negativos/cero/texto).
  const first = stripped.split(';')[0] ?? '';
  return /[dmyhs]/i.test(first) && !/^general$/i.test(first.trim());
}

// ------------------------------------------------------------------ Libro y hojas

export class XlsxSheet {
  readonly cells = new Map<string, XlsxCell>();
  maxRow = 0;
  maxCol = 0;

  constructor(readonly name: string, readonly path: string) {}

  /** @internal */
  add(cell: XlsxCell): void {
    this.cells.set(cell.ref, cell);
    if (cell.row > this.maxRow) this.maxRow = cell.row;
    if (cell.col > this.maxCol) this.maxCol = cell.col;
  }

  cell(row: number, col: number): XlsxCell | undefined {
    return this.cells.get(cellRef(row, col));
  }

  /** Valor de la celda (null si no existe). Columnas/filas 1-based. */
  value(row: number, col: number): CellValue {
    return this.cell(row, col)?.value ?? null;
  }

  /** Valor por referencia "B4". */
  get(ref: string): CellValue {
    const { row, col } = parseCellRef(ref);
    return this.value(row, col);
  }

  /** Fila como arreglo 0-based por columna (A = índice 0), hasta `maxCol`. */
  rowValues(row: number): CellValue[] {
    const out: CellValue[] = [];
    for (let c = 1; c <= this.maxCol; c++) out.push(this.value(row, c));
    return out;
  }
}

export class XlsxWorkbook {
  readonly sheetNames: string[];
  readonly date1904: boolean;
  private readonly sheetPaths = new Map<string, string>();
  private readonly cache = new Map<string, XlsxSheet>();
  private readonly sharedStrings: string[];
  private readonly dateStyles: boolean[];

  constructor(private readonly zip: ZipArchive) {
    if (!zip.has('xl/workbook.xml')) throw new Error('XLSX inválido: falta xl/workbook.xml');
    const wb = parseXml(zip.readText('xl/workbook.xml'), 'xl/workbook.xml');
    const pr = firstChild(wb, 'workbookPr');
    this.date1904 = pr ? ['1', 'true'].includes(attrLocal(pr, 'date1904') ?? '') : false;

    const rels = this.readRels('xl/_rels/workbook.xml.rels', 'xl/');
    const sheetsEl = firstChild(wb, 'sheets');
    if (!sheetsEl) throw new Error('XLSX inválido: workbook.xml sin <sheets>');
    this.sheetNames = [];
    for (const s of childElements(sheetsEl, 'sheet')) {
      const name = s.attrs.name;
      const rid = attrLocal(s, 'id');
      if (!name || !rid) throw new Error('XLSX inválido: <sheet> sin nombre o r:id');
      const rel = rels.get(rid);
      if (!rel) throw new Error(`XLSX inválido: la hoja "${name}" referencia ${rid} inexistente`);
      if (!rel.type.endsWith('/worksheet')) continue; // hojas de gráfico, macros, etc.
      this.sheetNames.push(name);
      this.sheetPaths.set(name, rel.target);
    }

    let ssPath: string | undefined;
    let stylesPath: string | undefined;
    for (const rel of rels.values()) {
      if (rel.type.endsWith('/sharedStrings')) ssPath = rel.target;
      if (rel.type.endsWith('/styles')) stylesPath = rel.target;
    }
    ssPath ??= zip.has('xl/sharedStrings.xml') ? 'xl/sharedStrings.xml' : undefined;
    stylesPath ??= zip.has('xl/styles.xml') ? 'xl/styles.xml' : undefined;
    this.sharedStrings = ssPath && zip.has(ssPath) ? this.readSharedStrings(ssPath) : [];
    this.dateStyles = stylesPath && zip.has(stylesPath) ? this.readDateStyles(stylesPath) : [];
  }

  private readRels(path: string, baseDir: string): Map<string, { target: string; type: string }> {
    const out = new Map<string, { target: string; type: string }>();
    if (!this.zip.has(path)) return out;
    const root = parseXml(this.zip.readText(path), path);
    for (const r of childElements(root, 'Relationship')) {
      const id = r.attrs.Id;
      const target = r.attrs.Target;
      if (!id || !target || r.attrs.TargetMode === 'External') continue;
      out.set(id, { target: resolvePartPath(baseDir, target), type: r.attrs.Type ?? '' });
    }
    return out;
  }

  private readSharedStrings(path: string): string[] {
    const root = parseXml(this.zip.readText(path), path);
    return childElements(root, 'si').map(richText);
  }

  private readDateStyles(path: string): boolean[] {
    const root = parseXml(this.zip.readText(path), path);
    const custom = new Map<number, string>();
    const numFmts = firstChild(root, 'numFmts');
    if (numFmts) for (const f of childElements(numFmts, 'numFmt')) custom.set(Number(f.attrs.numFmtId), f.attrs.formatCode ?? '');
    const xfs = firstChild(root, 'cellXfs');
    if (!xfs) return [];
    return childElements(xfs, 'xf').map(xf => {
      const id = Number(xf.attrs.numFmtId ?? 0);
      const code = custom.get(id);
      return code !== undefined ? isDateFormatCode(code) : BUILTIN_DATE_FORMATS.has(id);
    });
  }

  /** Hoja por nombre exacto. Error claro si no existe. */
  sheet(name: string): XlsxSheet {
    const cached = this.cache.get(name);
    if (cached) return cached;
    const path = this.sheetPaths.get(name);
    if (!path) throw new Error(`XLSX: no existe la hoja "${name}" (hojas: ${this.sheetNames.map(n => `"${n}"`).join(', ')})`);
    const sheet = this.parseSheet(name, path);
    this.cache.set(name, sheet);
    return sheet;
  }

  /** Hoja por posición (0-based). */
  sheetAt(index: number): XlsxSheet {
    const name = this.sheetNames[index];
    if (name === undefined) throw new Error(`XLSX: no existe la hoja #${index + 1} (el libro tiene ${this.sheetNames.length})`);
    return this.sheet(name);
  }

  private parseSheet(name: string, path: string): XlsxSheet {
    const root = parseXml(this.zip.readText(path), path);
    const data = firstChild(root, 'sheetData');
    if (!data) throw new Error(`XLSX inválido: la hoja "${name}" no tiene <sheetData>`);
    const sheet = new XlsxSheet(name, path);
    let rowNum = 0;
    for (const row of childElements(data, 'row')) {
      rowNum = row.attrs.r ? Number(row.attrs.r) : rowNum + 1;
      if (!Number.isInteger(rowNum) || rowNum < 1) throw new Error(`XLSX: número de fila inválido en "${name}"`);
      let colNum = 0;
      for (const c of childElements(row, 'c')) {
        if (c.attrs.r) {
          const ref = parseCellRef(c.attrs.r);
          if (ref.row !== rowNum) throw new Error(`XLSX: la celda ${c.attrs.r} no pertenece a la fila ${rowNum} en "${name}"`);
          colNum = ref.col;
        } else colNum += 1;
        const cell = this.parseCell(c, rowNum, colNum, name);
        if (cell) sheet.add(cell);
      }
    }
    return sheet;
  }

  private parseCell(c: XmlElement, row: number, col: number, sheetName: string): XlsxCell | null {
    const ref = cellRef(row, col);
    const t = c.attrs.t ?? 'n';
    const vEl = firstChild(c, 'v');
    const v = vEl ? textContent(vEl) : undefined;
    const base = { ref, row, col, isDate: false };
    switch (t) {
      case 's': {
        if (v === undefined) return null;
        const idx = Number(v);
        const s = this.sharedStrings[idx];
        if (!Number.isInteger(idx) || s === undefined) throw new Error(`XLSX: string compartida ${v} inexistente en ${sheetName}!${ref}`);
        return { ...base, type: 'string', value: s };
      }
      case 'str':
        return v === undefined ? null : { ...base, type: 'string', value: decodeOoxmlEscapes(v) };
      case 'inlineStr': {
        const is = firstChild(c, 'is');
        return is ? { ...base, type: 'string', value: richText(is) } : null;
      }
      case 'b':
        return v === undefined ? null : { ...base, type: 'boolean', value: v.trim() === '1' || v.trim() === 'true' };
      case 'e':
        return v === undefined ? null : { ...base, type: 'error', value: v.trim() };
      case 'd': {
        if (v === undefined) return null;
        const ms = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : `${v}${v.includes('T') ? '' : 'T00:00:00'}Z`);
        if (!Number.isFinite(ms)) throw new Error(`XLSX: fecha ISO inválida "${v}" en ${sheetName}!${ref}`);
        const serial = this.date1904 ? (ms - EPOCH_1904) / DAY_MS : (ms - EPOCH_1900) / DAY_MS;
        return { ...base, type: 'number', value: serial, isDate: true };
      }
      case 'n': {
        if (v === undefined || v.trim() === '') return null;
        const n = Number(v);
        if (!Number.isFinite(n)) throw new Error(`XLSX: número inválido "${v}" en ${sheetName}!${ref}`);
        const style = c.attrs.s !== undefined ? Number(c.attrs.s) : 0;
        return { ...base, type: 'number', value: n, isDate: this.dateStyles[style] ?? false };
      }
      default:
        throw new Error(`XLSX: tipo de celda "${t}" no soportado en ${sheetName}!${ref}`);
    }
  }
}

function resolvePartPath(baseDir: string, target: string): string {
  const raw = target.startsWith('/') ? target.slice(1) : baseDir + target;
  const parts: string[] = [];
  for (const seg of raw.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

/** Abre un XLSX desde bytes. Lanza errores claros si no es un ZIP/XLSX válido. */
export function readXlsx(data: Uint8Array | ArrayBuffer): XlsxWorkbook {
  return new XlsxWorkbook(new ZipArchive(data));
}
