import { describe, expect, it } from 'vitest';
import { CSV_BOM, csvNumber, toCsv } from '@/web/lib/csv';

describe('CSV', () => {
  const csv = toCsv({
    periods: ['2024-01', '2024-02', '2024-03'],
    columns: [
      { header: 'IPC nacional — Var. % mensual (%)', values: [20.61234567891234, null, 11.0] },
      { header: 'Serie; con "comillas"', values: [1234567.5, 0, -0.000001] },
    ],
  });
  const lines = csv.slice(1).trimEnd().split('\r\n');

  it('UTF-8 con BOM y separador ;', () => {
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(lines[0]).toBe('fecha;periodo;IPC nacional — Var. % mensual (%);"Serie; con ""comillas"""');
  });

  it('fecha ISO (primer día del período) y período canónico', () => {
    expect(lines[1]!.startsWith('2024-01-01;2024-01;')).toBe(true);
    expect(toCsv({ periods: ['2024-Q2'], columns: [{ header: 'x', values: [1] }] })).toContain('2024-04-01;2024-Q2;1');
  });

  it('valores sin redondear con coma decimal; faltante vacío; cero es cero', () => {
    expect(lines[1]).toBe('2024-01-01;2024-01;20,61234567891234;1234567,5');
    expect(lines[2]).toBe('2024-02-01;2024-02;;0');
    expect(lines[3]).toBe('2024-03-01;2024-03;11;-0,000001');
  });

  it('sin notación exponencial', () => {
    expect(csvNumber(1e-7)).toBe('0,0000001');
    expect(csvNumber(null)).toBe('');
  });
});
