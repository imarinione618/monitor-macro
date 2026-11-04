import { describe, expect, it } from 'vitest';
import { a1Range, colIndex, colLetter, parseA1 } from '../../src/sheets/a1';
import { buildDataGrid, planTopic, serialToPeriod, TECH_DATE_KEY, RETIRED_PREFIX } from '../../src/sheets/layout';
import { chunkRequests, chunkValueWrites } from '../../src/sheets/writer';
import { periodToSheetsSerial } from '../../src/core/periods';
import { getSeries, seriesByTopic } from '../../src/core/registry';
import { buildWideTable } from '../../src/core/views';
import { mutableSource, NOW } from './helpers';

describe('A1', () => {
  it('letras de columna', () => {
    expect(colLetter(0)).toBe('A');
    expect(colLetter(25)).toBe('Z');
    expect(colLetter(26)).toBe('AA');
    expect(colLetter(701)).toBe('ZZ');
    expect(colIndex('AA')).toBe(26);
  });
  it('rango con comillas y parseo', () => {
    const r = a1Range("O'Brien", 2, 1, 10, 4);
    expect(r).toBe("'O''Brien'!B3:D10");
    expect(parseA1(r)).toEqual({ title: "O'Brien", row0: 2, col0: 1, rowEnd: 10, colEnd: 4 });
    expect(parseA1("'DATOS_EMAE_M'")).toMatchObject({ title: 'DATOS_EMAE_M', row0: null });
  });
});

describe('fechas', () => {
  it('serial ↔ período por frecuencia', () => {
    for (const p of ['2016-12', '2024-01', '2024-02']) expect(serialToPeriod(periodToSheetsSerial(p), 'M')).toBe(p);
    for (const p of ['2016-Q2', '2024-Q4']) expect(serialToPeriod(periodToSheetsSerial(p), 'Q')).toBe(p);
    for (const p of ['2016-S2', '2025-S1']) expect(serialToPeriod(periodToSheetsSerial(p), 'S')).toBe(p);
    expect(periodToSheetsSerial('2024-01')).toBe(45292); // 01/01/2024 en Sheets
  });
});

describe('plan de documento', () => {
  it('pestañas por familia y frecuencia, fila técnica + encabezado legible, fechas numéricas ascendentes', () => {
    const { src } = mutableSource();
    const plan = planTopic({ topic: 'laboral', source: src, now: NOW });
    const keys = plan.tabs.map((t) => t.key);
    expect(keys).toEqual(expect.arrayContaining(['LEEME', 'CATALOGO', 'CONTROL', 'DATOS_SALARIOS_M', 'DATOS_EPH_TASAS_Q', 'DATOS_POBREZA_S', 'CALCULOS_EPH_TASAS_Q', 'EJEMPLO_GRAFICO', 'GRAFICOS_USUARIO']));
    const eph = plan.tabs.find((t) => t.key === 'DATOS_EPH_TASAS_Q')!;
    expect(eph.grid[0]![0]).toBe(TECH_DATE_KEY);
    expect(eph.grid[0]).toContain('laboral.eph.desocupacion|level');
    expect(eph.grid[1]![0]).toBe('Fecha');
    const dates = eph.grid.slice(2).map((r) => r[0]);
    expect(dates.every((d) => typeof d === 'number')).toBe(true);
    expect([...dates].sort((a, b) => (a as number) - (b as number))).toEqual(dates);
    expect(serialToPeriod(dates[0] as number, 'Q')).toBe(src.getData('laboral.eph.desocupacion')!.meta.firstPeriod);
    // sin celdas combinadas ni texto en filas de datos
    for (const row of eph.grid.slice(2)) for (const v of row.slice(1)) expect(v === null || typeof v === 'number').toBe(true);
    expect(plan.synthetic).toBe(true);
    expect(plan.chart).toMatchObject({ dataTabKey: 'DATOS_EPH_TASAS_Q' });
  });

  it('CALCULOS = buildWideTable (misma serie, período y transformación)', () => {
    const { src } = mutableSource();
    const plan = planTopic({ topic: 'precios', source: src, now: NOW });
    const calc = plan.tabs.find((t) => t.key === 'CALCULOS_IPC_NIVEL_GENERAL_M')!;
    const specs = calc.columns!.map((c) => ({ seriesId: c.seriesId!, transform: c.transform! }));
    const table = buildWideTable(specs, getSeries, (id) => src.getData(id));
    expect(calc.grid.length - 2).toBe(table.periods.length);
    table.periods.forEach((p, r) => {
      expect(calc.grid[r + 2]![0]).toBe(periodToSheetsSerial(p));
      table.columns.forEach((c, j) => expect(calc.grid[r + 2]![j + 1]).toBe(table.values[j]![r]));
    });
  });

  it('el gráfico de precios apunta a IPC nacional var. m/m en CALCULOS', () => {
    const { src } = mutableSource();
    const plan = planTopic({ topic: 'precios', source: src, now: NOW });
    const tab = plan.tabs.find((t) => t.key === plan.chart!.dataTabKey)!;
    expect(tab.role).toBe('calculos');
    expect(tab.grid[0]![plan.chart!.seriesColumns[0]!]).toBe('precios.ipc.ng.nacional|pct_prev');
  });

  it('respeta el orden existente, agrega nuevas al final y conserva retiradas', () => {
    const { src } = mutableSource();
    const defs = seriesByTopic('comex').filter((d) => d.family === 'comercio_totales');
    const t1 = buildWideTable(defs.map((d) => ({ seriesId: d.id, transform: 'level' as const })), getSeries, (id) => src.getData(id));
    const first = buildDataGrid(t1, undefined).grid;
    // existente con orden invertido y una clave que ya no existe
    const existing = first.map((r) => [r[0]!, ...r.slice(1).reverse(), r[0] === TECH_DATE_KEY ? 'comex.vieja|level' : r[0] === 'Fecha' ? 'Serie vieja' : 7]);
    const t2 = buildWideTable([{ seriesId: 'comex.expo.total', transform: 'level' }, { seriesId: 'comex.impo.total', transform: 'level' }, { seriesId: 'comex.saldo', transform: 'level' }], getSeries, (id) => src.getData(id));
    const { grid, columns } = buildDataGrid(t2, existing);
    expect(grid[0]).toEqual([TECH_DATE_KEY, 'comex.saldo|level', 'comex.impo.total|level', 'comex.expo.total|level', 'comex.vieja|level']);
    expect(columns[3]!.retired).toBe(true);
    expect(grid[1]![4]).toBe(RETIRED_PREFIX + 'Serie vieja');
    expect(grid[2]![4]).toBe(7);
  });
});

describe('troceo', () => {
  it('values: bloques de filas que no superan el tamaño máximo', () => {
    const values = Array.from({ length: 500 }, (_, i) => [i, Math.PI * i, 'x'.repeat(20)]);
    const batches = chunkValueWrites([{ title: 'T', row0: 0, col0: 0, values }], 5000);
    expect(batches.length).toBeGreaterThanOrEqual(4);
    let rows = 0;
    for (const b of batches) {
      expect(JSON.stringify(b).length).toBeLessThan(5000 + 500);
      for (const vr of b) {
        const a = parseA1(vr.range);
        expect(a.row0).toBe(rows);
        rows += vr.values.length;
        expect(a.rowEnd).toBe(rows);
      }
    }
    expect(rows).toBe(500);
  });
  it('batchUpdate: por cantidad y bytes', () => {
    const reqs = Array.from({ length: 1200 }, (_, i) => ({ addSheet: { properties: { title: `T${i}` } } }));
    const chunks = chunkRequests(reqs, 500, 10_000_000);
    expect(chunks.map((c) => c.length)).toEqual([500, 500, 200]);
    expect(chunkRequests(reqs, 1000, 2000).every((c) => JSON.stringify(c).length < 2100)).toBe(true);
  });
});
