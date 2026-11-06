/**
 * Escritor ZIP/XLSX mínimo para tests (genera libros sintéticos y recorta fixtures reales).
 * No es parte del código de producción.
 */
import { deflateRawSync } from 'node:zlib';
import { crc32, dateToExcelSerial, ZipArchive } from '../../src/external/xlsx';

const enc = new TextEncoder();

export function buildZip(files: Record<string, string | Uint8Array>, opts: { store?: boolean } = {}): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const method = opts.store ? 0 : 8;
    const comp = method === 0 ? data : new Uint8Array(deflateRawSync(data));
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + comp.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, comp.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(comp, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, comp.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, eocd]) { out.set(part, p); p += part.length; }
  return out;
}

/** Reescribe un ZIP: `edits[name]` = función sobre el texto, `null` para eliminar la entrada. */
export function rezip(bytes: Uint8Array, edits: Record<string, ((s: string) => string) | null>): Uint8Array {
  const zip = new ZipArchive(bytes);
  const files: Record<string, string | Uint8Array> = {};
  for (const name of zip.entries.keys()) {
    const edit = edits[name];
    if (edit === null) continue;
    files[name] = edit ? edit(zip.readText(name)) : zip.read(name);
  }
  return buildZip(files);
}

// ------------------------------------------------------------------ XLSX sintético

export type CellSpec =
  | number
  | string
  | null
  | undefined
  | { date: string } // ISO yyyy-mm-dd → serial con formato de fecha integrado (numFmtId 14)
  | { customDate: string } // serial con formato personalizado "mmm-yy"
  | { inline: string } // t="inlineStr"
  | { str: string } // t="str" (resultado de fórmula)
  | { bool: boolean };

export interface SheetSpec {
  name: string;
  rows: CellSpec[][];
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function colLetters(col: number): string {
  let s = '';
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Libro XLSX con strings compartidas, estilos de fecha (integrado y personalizado) y N hojas. */
export function buildXlsx(sheets: SheetSpec[], opts: { store?: boolean; date1904?: boolean } = {}): Uint8Array {
  const shared: string[] = [];
  const sharedIdx = new Map<string, number>();
  const si = (s: string) => {
    let i = sharedIdx.get(s);
    if (i === undefined) { i = shared.length; shared.push(s); sharedIdx.set(s, i); }
    return i;
  };
  const files: Record<string, string> = {};
  sheets.forEach((sheet, k) => {
    const rowsXml = sheet.rows.map((row, r) => {
      const cells = row.map((v, c) => {
        const ref = `${colLetters(c + 1)}${r + 1}`;
        if (v === null || v === undefined) return '';
        if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
        if (typeof v === 'string') return `<c r="${ref}" t="s"><v>${si(v)}</v></c>`;
        if ('date' in v) return `<c r="${ref}" s="1"><v>${dateToExcelSerial(new Date(`${v.date}T00:00:00Z`))}</v></c>`;
        if ('customDate' in v) return `<c r="${ref}" s="2"><v>${dateToExcelSerial(new Date(`${v.customDate}T00:00:00Z`))}</v></c>`;
        if ('inline' in v) return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v.inline)}</t></is></c>`;
        if ('str' in v) return `<c r="${ref}" t="str"><f>"x"</f><v>${esc(v.str)}</v></c>`;
        return `<c r="${ref}" t="b"><v>${v.bool ? 1 : 0}</v></c>`;
      }).join('');
      return `<row r="${r + 1}">${cells}</row>`;
    }).join('');
    files[`xl/worksheets/sheet${sheets.length - k}.xml`] =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;
  });
  const ns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  files['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, k) => `<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  files['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  // La hoja k se guarda en sheet{n-k}.xml: comprueba que el mapeo nombre → archivo se hace por rels.
  files['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${ns}"><workbookPr${opts.date1904 ? ' date1904="1"' : ''}/><sheets>${sheets.map((s, k) => `<sheet name="${esc(s.name)}" sheetId="${k + 1}" r:id="rIdS${k + 1}"/>`).join('')}</sheets></workbook>`;
  files['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, k) => `<Relationship Id="rIdS${k + 1}" Type="${ns}/worksheet" Target="worksheets/sheet${sheets.length - k}.xml"/>`).join('')}<Relationship Id="rIdSS" Type="${ns}/sharedStrings" Target="/xl/sharedStrings.xml"/><Relationship Id="rIdST" Type="${ns}/styles" Target="styles.xml"/></Relationships>`;
  files['xl/styles.xml'] = `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="[$-2C0A]mmm\\-yy;@"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`;
  files['xl/sharedStrings.xml'] = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared.map(s => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`;
  return buildZip(files, opts);
}
