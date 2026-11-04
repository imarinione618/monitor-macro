/** Utilidades de notación A1 y comparación de grillas. */
import type { CellValue, Grid } from './types';

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function colLetter(index0: number): string {
  let n = index0 + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** "AA" → 26. */
export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Nombre de pestaña entre comillas simples (escapando comillas internas). */
export function quoteTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/** Rango A1 rectangular (filas/columnas 0-based, fin exclusivo). */
export function a1Range(title: string, row0: number, col0: number, rowEnd: number, colEnd: number): string {
  return `${quoteTitle(title)}!${colLetter(col0)}${row0 + 1}:${colLetter(colEnd - 1)}${rowEnd}`;
}

export interface ParsedA1 {
  title: string;
  /** null = desde el inicio / hasta el final de la hoja. */
  row0: number | null;
  col0: number | null;
  rowEnd: number | null;
  colEnd: number | null;
}

/** Parser A1 acotado a las formas que usa el writer: 'T', 'T'!A1, 'T'!A1:C9. */
export function parseA1(range: string): ParsedA1 {
  let title: string;
  let rest = '';
  if (range.startsWith("'")) {
    let i = 1;
    let t = '';
    for (; i < range.length; i++) {
      if (range[i] === "'") {
        if (range[i + 1] === "'") {
          t += "'";
          i++;
          continue;
        }
        break;
      }
      t += range[i];
    }
    title = t;
    rest = range.slice(i + 1);
  } else {
    const bang = range.indexOf('!');
    title = bang < 0 ? range : range.slice(0, bang);
    rest = bang < 0 ? '' : range.slice(bang);
  }
  if (!rest) return { title, row0: null, col0: null, rowEnd: null, colEnd: null };
  const m = /^!([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/.exec(rest);
  if (!m) throw new Error(`Rango A1 no soportado: ${range}`);
  const col0 = colIndex(m[1]!);
  const row0 = m[2] ? Number(m[2]) - 1 : 0;
  const colEnd = m[3] ? colIndex(m[3]) + 1 : col0 + 1;
  const rowEnd = m[4] ? Number(m[4]) : m[3] ? null : m[2] ? row0 + 1 : null;
  return { title, row0, col0, rowEnd, colEnd: m[3] || m[2] ? colEnd : null };
}

/** Normaliza para comparar: '' ≡ null; números no finitos → null. */
export function normCell(v: CellValue | undefined): CellValue {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  return v;
}

/** Igualdad de celdas con tolerancia relativa mínima para doubles leídos de la API. */
export function cellsEqual(a: CellValue | undefined, b: CellValue | undefined): boolean {
  const x = normCell(a);
  const y = normCell(b);
  if (typeof x === 'number' && typeof y === 'number') {
    if (x === y) return true;
    return Math.abs(x - y) <= 1e-12 * Math.max(1, Math.abs(x), Math.abs(y));
  }
  return x === y;
}

export function gridWidth(g: Grid): number {
  return g.reduce((w, r) => Math.max(w, r.length), 0);
}

/** Dimensiones "usadas" (sin filas/columnas vacías al final), como devuelve values.get. */
export function usedSize(g: Grid): { rows: number; cols: number } {
  let rows = 0;
  let cols = 0;
  g.forEach((r, i) => {
    let last = -1;
    r.forEach((v, j) => {
      if (normCell(v) !== null) last = j;
    });
    if (last >= 0) {
      rows = i + 1;
      cols = Math.max(cols, last + 1);
    }
  });
  return { rows, cols };
}

/** Compara dos grillas dentro de [0..rows) × [0..cols). */
export function gridsEqualWithin(a: Grid, b: Grid, rows: number, cols: number): boolean {
  for (let r = 0; r < rows; r++) {
    const ra = a[r] ?? [];
    const rb = b[r] ?? [];
    for (let c = 0; c < cols; c++) if (!cellsEqual(ra[c], rb[c])) return false;
  }
  return true;
}
