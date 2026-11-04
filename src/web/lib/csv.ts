/**
 * CSV de lo seleccionado en un gráfico.
 *  - UTF-8 con BOM (Excel lo abre con acentos correctos).
 *  - Separador ";" y coma decimal (configuración regional es-AR de Excel).
 *  - Fecha ISO (primer día del período) + período canónico.
 *  - Valores SIN redondear (representación completa del número almacenado/calculado).
 *  - Faltante = celda vacía (nunca 0).
 */
import { periodStartDate } from '@/core/periods';
import type { Period } from '@/core/types';

export const CSV_BOM = '﻿';
export const CSV_SEP = ';';

export interface CsvInput {
  periods: Period[];
  columns: { header: string; values: (number | null)[] }[];
}

function quote(s: string): string {
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Número sin redondear con coma decimal y sin separador de miles. Evita notación exponencial. */
export function csvNumber(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  let s = String(v);
  if (/e/i.test(s)) {
    // Expandir notación exponencial sin perder dígitos significativos.
    s = v.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
  }
  return s.replace('.', ',');
}

export function toCsv({ periods, columns }: CsvInput): string {
  const header = ['fecha', 'periodo', ...columns.map((c) => c.header)].map(quote).join(CSV_SEP);
  const lines = periods.map((p, i) => [periodStartDate(p), p, ...columns.map((c) => csvNumber(c.values[i]))].map(quote).join(CSV_SEP));
  return CSV_BOM + [header, ...lines].join('\r\n') + '\r\n';
}
