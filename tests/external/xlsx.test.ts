import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { columnIndex, columnLetters, excelSerialToDate, parseCellRef, parseXml, readXlsx, textContent } from '../../src/external/xlsx';
import { buildXlsx, buildZip, rezip } from './xlsx-writer';

const FIX = path.resolve(__dirname, '../fixtures/real/idecba');

describe('excelSerialToDate', () => {
  it('convierte seriales del sistema 1900', () => {
    expect(excelSerialToDate(41091).toISOString()).toBe('2012-07-01T00:00:00.000Z');
    expect(excelSerialToDate(44593).toISOString()).toBe('2022-02-01T00:00:00.000Z');
    expect(excelSerialToDate(1).toISOString()).toBe('1900-01-01T00:00:00.000Z');
    expect(excelSerialToDate(61).toISOString()).toBe('1900-03-01T00:00:00.000Z');
    expect(excelSerialToDate(45000.5).toISOString()).toBe('2023-03-15T12:00:00.000Z');
  });
  it('convierte seriales del sistema 1904', () => {
    expect(excelSerialToDate(0, true).toISOString()).toBe('1904-01-01T00:00:00.000Z');
    expect(excelSerialToDate(43131, true).toISOString()).toBe('2022-02-01T00:00:00.000Z');
  });
});

describe('referencias de celda', () => {
  it('convierte letras y referencias', () => {
    expect(columnIndex('A')).toBe(1);
    expect(columnIndex('BF')).toBe(58);
    expect(columnLetters(58)).toBe('BF');
    expect(columnLetters(703)).toBe('AAA');
    expect(parseCellRef('$C$12')).toEqual({ row: 12, col: 3 });
    expect(() => parseCellRef('12C')).toThrow(/inválida/);
  });
});

describe('parseXml', () => {
  it('decodifica entidades, CDATA y prefijos', () => {
    const el = parseXml('<?xml version="1.0"?><x:a xmlns:x="u" b="1 &amp; 2"><x:t>&lt;hola&gt; &#225;&#x00e9;</x:t><![CDATA[<c>]]></x:a>');
    expect(el.local).toBe('a');
    expect(el.attrs.b).toBe('1 & 2');
    expect(textContent(el)).toBe('<hola> áé<c>');
  });
  it('rechaza XML mal formado y DTD', () => {
    expect(() => parseXml('<a><b></a>')).toThrow(/inesperado/);
    expect(() => parseXml('<a>')).toThrow(/incompleto/);
    expect(() => parseXml('<!DOCTYPE a [<!ENTITY x "y">]><a/>')).toThrow(/no soportadas/);
  });
});

describe('readXlsx (sintético)', () => {
  const bytes = buildXlsx([
    {
      name: 'Datos',
      rows: [
        ['Título', null, { inline: 'en línea' }],
        [1.5, -2, { str: 'fórmula' }, { bool: true }],
        [{ date: '2022-02-01' }, { customDate: '2026-10-01' }, 44593],
      ],
    },
    { name: 'Ficha Técnica', rows: [['Otra hoja']] },
  ]);

  it('lee strings compartidas, inline, str, booleanos y números', () => {
    const wb = readXlsx(bytes);
    expect(wb.sheetNames).toEqual(['Datos', 'Ficha Técnica']);
    const s = wb.sheet('Datos');
    expect(s.get('A1')).toBe('Título');
    expect(s.get('B1')).toBeNull();
    expect(s.get('C1')).toBe('en línea');
    expect(s.value(2, 1)).toBe(1.5);
    expect(s.value(2, 2)).toBe(-2);
    expect(s.get('C2')).toBe('fórmula');
    expect(s.get('D2')).toBe(true);
    expect(s.maxRow).toBe(3);
    expect(s.maxCol).toBe(4);
    expect(s.rowValues(2)).toEqual([1.5, -2, 'fórmula', true]);
  });

  it('detecta fechas por estilo (integrado y personalizado) y deja el serial', () => {
    const s = readXlsx(bytes).sheet('Datos');
    const a3 = s.cell(3, 1)!;
    expect(a3.isDate).toBe(true);
    expect(excelSerialToDate(a3.value as number).toISOString().slice(0, 10)).toBe('2022-02-01');
    const b3 = s.cell(3, 2)!;
    expect(b3.isDate).toBe(true);
    expect(excelSerialToDate(b3.value as number).toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(s.cell(3, 3)!.isDate).toBe(false);
  });

  it('mapea hojas por nombre vía rels (no por posición del archivo)', () => {
    const wb = readXlsx(bytes);
    expect(wb.sheet('Ficha Técnica').get('A1')).toBe('Otra hoja');
    expect(wb.sheetAt(0).name).toBe('Datos');
    expect(() => wb.sheet('Inexistente')).toThrow(/no existe la hoja "Inexistente".*"Datos", "Ficha Técnica"/);
    expect(() => wb.sheetAt(5)).toThrow(/#6/);
  });

  it('acepta entradas sin comprimir (stored) y sistema 1904', () => {
    const wb = readXlsx(buildXlsx([{ name: 'H', rows: [[{ date: '2022-02-01' }]] }], { store: true, date1904: true }));
    expect(wb.date1904).toBe(true);
    expect(wb.sheet('H').cell(1, 1)!.isDate).toBe(true);
  });
});

describe('readXlsx (XML a mano)', () => {
  const ns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const base = {
    'xl/workbook.xml': `<workbook xmlns:r="${ns}"><sheets><sheet name="S" sheetId="1" r:id="r1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="r1" Type="${ns}/worksheet" Target="worksheets/hoja.xml"/><Relationship Id="r2" Type="${ns}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    'xl/sharedStrings.xml':
      '<sst><si><r><t>Ri</t></r><r><rPr/><t xml:space="preserve">co </t></r><rPh><t>ignorar</t></rPh></si><si><t>a_x000D_b</t></si><si><t></t></si></sst>',
  };

  it('texto enriquecido, escapes _xHHHH_, celdas sin r y tipos e/d', () => {
    const sheet =
      '<worksheet><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c><c t="s"><v>2</v></c></row>' +
      '<row r="3"><c r="B3" t="e"><v>#N/A</v></c><c t="d"><v>2022-02-01</v></c><c r="E3" s="0"><v>7</v></c></row></sheetData></worksheet>';
    const wb = readXlsx(buildZip({ ...base, 'xl/worksheets/hoja.xml': sheet }));
    const s = wb.sheet('S');
    expect(s.get('A1')).toBe('Rico ');
    expect(s.get('B1')).toBe('a\rb');
    expect(s.get('C1')).toBe('');
    expect(s.cell(3, 2)).toMatchObject({ type: 'error', value: '#N/A' });
    expect(s.cell(3, 3)).toMatchObject({ type: 'number', isDate: true, value: 44593 });
    expect(s.get('E3')).toBe(7);
  });

  it('errores claros ante índices de string inexistentes o tipos desconocidos', () => {
    const bad = (cell: string) => readXlsx(buildZip({ ...base, 'xl/worksheets/hoja.xml': `<worksheet><sheetData><row r="1">${cell}</row></sheetData></worksheet>` })).sheet('S');
    expect(() => bad('<c r="A1" t="s"><v>9</v></c>')).toThrow(/string compartida 9 inexistente/);
    expect(() => bad('<c r="A1" t="zz"><v>1</v></c>')).toThrow(/tipo de celda "zz"/);
    expect(() => bad('<c r="A1"><v>abc</v></c>')).toThrow(/número inválido/);
    expect(() => bad('<c r="A2"><v>1</v></c>')).toThrow(/no pertenece a la fila 1/);
  });
});

describe('ZIP inválido', () => {
  it('no es ZIP', () => {
    expect(() => readXlsx(new TextEncoder().encode('<html>error</html> '.repeat(5)))).toThrow(/directorio central/);
    expect(() => readXlsx(new Uint8Array(3))).toThrow(/demasiado chico/);
  });
  it('detecta CRC incorrecto', () => {
    const bytes = buildXlsx([{ name: 'H', rows: [[1]] }], { store: true });
    const text = new TextDecoder('latin1').decode(bytes);
    const i = text.indexOf('<sheetData>');
    const corrupted = bytes.slice();
    corrupted[i + 1] = 'S'.charCodeAt(0);
    expect(() => readXlsx(corrupted).sheet('H')).toThrow(/CRC incorrecto/);
  });
  it('falta workbook.xml', () => {
    expect(() => readXlsx(buildZip({ 'a.txt': 'x' }))).toThrow(/falta xl\/workbook.xml/);
  });
});

describe('readXlsx (fixture real IDECBA)', () => {
  const bytes = new Uint8Array(fs.readFileSync(path.join(FIX, 'IPCBA_base_2021100-Nivel_general_empalme.xlsx')));

  it('lee títulos, fechas con estilo y valores sin redondear', () => {
    const s = readXlsx(bytes).sheet('Nivel_general_empalme');
    expect(String(s.get('A1'))).toMatch(/^IPCBA \(base 2021 = 100\)\. Nivel General/);
    const a5 = s.cell(5, 1)!;
    expect(a5.isDate).toBe(true);
    expect(excelSerialToDate(a5.value as number).toISOString().slice(0, 10)).toBe('2012-07-01');
    expect(s.get('B5')).toBe(6.4363876898803678);
    expect(s.get('B176')).toBe(2695);
  });

  it('rezip preserva el contenido', () => {
    const again = readXlsx(rezip(bytes, {})).sheet('Nivel_general_empalme');
    expect(again.get('B176')).toBe(2695);
  });
});
