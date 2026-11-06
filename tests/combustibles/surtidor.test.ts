import { describe, expect, it } from 'vitest';
import { parseCsvLine } from '../../src/combustibles/csv';
import { surtidorId } from '../../src/combustibles/defs';
import {
  EventBook, argentinaDay, closedLastDay, computeDaily, dayNumber, decodeState, encodeState, median, parseVigencia, readSurtidorCsv,
} from '../../src/combustibles/surtidor';
import { fixture, historicoCsv, linesOf, vigentesCsv, type Ev } from './helpers';

const minute = (at: string) => dayNumber(at.slice(0, 10)) * 1440 + Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16));
const day = (series: Map<string, { date: string; value: number | null; n?: number }[]>, id: string, date: string) => series.get(id)!.find(o => o.date === date);
const SUPER = surtidorId('super', 'nacional');
const SUPER_CABA = surtidorId('super', 'caba');

async function bookOf(events: Ev[], today = '2026-12-31') {
  const book = new EventBook();
  await readSurtidorCsv(linesOf(historicoCsv(events)), book, today, 'test');
  return book;
}

describe('fechas de vigencia', () => {
  it('interpreta los dos formatos publicados como la misma marca de tiempo', () => {
    expect(parseVigencia('01/04/2024 10:11')).toBe(minute('2024-04-01 10:11'));
    expect(parseVigencia('2024-04-01 10:11:00')).toBe(minute('2024-04-01 10:11'));
    expect(parseVigencia('2026-11-02 13:23:00')).toBe(parseVigencia('02/11/2026 13:23'));
  });
  it.each(['31/02/2024 10:00', '2024-13-01 10:00:00', '01/04/2024 25:00', '2024-04-01', 'abc', '', undefined])('rechaza %j', raw => {
    expect(parseVigencia(raw)).toBeNull();
  });
  it('usa la fecha de Argentina (UTC−3)', () => {
    expect(argentinaDay(new Date('2026-11-07T02:00:00Z'))).toBe('2026-11-06');
    expect(argentinaDay(new Date('2026-11-07T03:00:00Z'))).toBe('2026-11-07');
  });
});

describe('lectura de CSV de la Res. 314', () => {
  it('respeta comillas y comillas escapadas', () => {
    expect(parseCsvLine('1,"a, b","{""x"":1}",')).toEqual(['1', 'a, b', '{"x":1}', '']);
  });

  it('lee las muestras reales de vigentes e histórico (BOM, formatos de fecha, horario diurno)', async () => {
    const book = new EventBook();
    const vig = await readSurtidorCsv(linesOf(fixture('vigentes-muestra.csv')), book, '2026-11-06', 'vigentes');
    expect(vig.used).toBeGreaterThan(0);
    expect(book.caba.has('6270')).toBe(true);
    const hist = await readSurtidorCsv(linesOf(fixture('historico-muestra.csv')), book, '2026-11-06', 'histórico');
    // 2 filas diurnas válidas (2024 y 2026) y la fila de año 9920 descartada como basura.
    expect(hist.used).toBe(2);
    expect(hist.outOfRange).toBe(1);
    expect([...book.events.get('1376|gasoil_g2')!.keys()]).toContain(minute('2024-04-01 10:11'));
  });

  it('descarta fechas basura (años 0008, 1157, 9920 y futuras) y precios ilegibles, y cuenta todo', async () => {
    const events: Ev[] = [
      { station: 1, price: 100, at: '2024-01-10 10:00' },
      { station: 2, price: 100, at: '0008-01-10 10:00' },
      { station: 3, price: 100, at: '1157-03-02 10:00' },
      { station: 4, price: 100, at: '9920-04-21 15:57' },
      { station: 5, price: 100, at: '2027-01-01 00:00' },
      { station: 6, price: 'N/D', at: '2024-01-10 10:00' },
      { station: 7, price: 100, at: '2024-01-10 10:00', horario: 3 },
      { station: 8, price: 100, at: '2024-01-10 10:00', product: '6' },
    ];
    const book = new EventBook();
    const stats = await readSurtidorCsv(linesOf(historicoCsv(events)), book, '2026-11-06', 'test');
    expect(stats).toMatchObject({ rows: 8, used: 1, outOfRange: 4, badPrice: 1, otherProductOrSchedule: 2 });
    expect([...book.events.keys()]).toEqual(['1|super']);
  });

  it('rechaza un fecha_vigencia con formato inválido como fecha basura', async () => {
    const book = new EventBook();
    const stats = await readSurtidorCsv(linesOf(historicoCsv([{ station: 1, price: 100, at: '2024-01-10 10:00' }], () => '2024/01/10')), book, '2026-11-06', 'test');
    expect(stats.badDate).toBe(1);
  });

  it('falla si cambia el esquema o el nombre de un producto', async () => {
    await expect(readSurtidorCsv(linesOf('idempresa,precio\n1,2\n'), new EventBook(), '2026-11-06', 'test')).rejects.toThrow(/cambió el esquema/);
    const renamed = historicoCsv([{ station: 1, price: 100, at: '2024-01-10 10:00' }]).replace('Nafta (súper) entre 92 y 95 Ron', 'Nafta Super');
    await expect(readSurtidorCsv(linesOf(renamed), new EventBook(), '2026-11-06', 'test')).rejects.toThrow(/ahora se llama/);
  });

  it('descarta declaraciones contradictorias con la misma marca de tiempo; vigentes prevalece sobre el histórico', async () => {
    const book = new EventBook();
    const stats = await readSurtidorCsv(linesOf(historicoCsv([
      { station: 1, price: 100, at: '2024-01-01 10:00' },
      { station: 1, price: 107.5, at: '2024-02-04 09:30' },
      { station: 1, price: 185.1, at: '2024-02-04 09:30' },
      { station: 1, price: 107.5, at: '2024-02-04 09:30' },
    ])), book, '2026-11-06', 'test');
    expect(stats.conflicts).toBe(1);
    expect(Number.isNaN(book.events.get('1|super')!.get(minute('2024-02-04 09:30')))).toBe(true);
    await readSurtidorCsv(linesOf(vigentesCsv([{ station: 1, price: 108, at: '2024-02-04 09:30' }])), book, '2026-11-06', 'vigentes');
    expect(book.events.get('1|super')!.get(minute('2024-02-04 09:30'))).toBe(108);
  });
});

describe('mediana diaria', () => {
  it('toma el último precio con vigencia hasta el cierre del día, sin interpolar', async () => {
    const book = await bookOf([
      { station: 1, price: 100, at: '2024-01-01 08:00' },
      { station: 1, price: 110, at: '2024-01-02 23:59' },
      { station: 1, price: 120, at: '2024-01-04 00:00' },
      { station: 2, price: 100, at: '2024-01-01 08:00' },
      { station: 3, price: 100, at: '2024-01-01 08:00' },
    ]);
    const out = computeDaily(book, '2023-12-31', '2024-01-04');
    expect(day(out, SUPER, '2023-12-31')).toEqual({ date: '2023-12-31', value: null, n: 0 });
    expect(day(out, SUPER, '2024-01-01')).toEqual({ date: '2024-01-01', value: 100, n: 3 });
    // El cambio de las 23:59 del 2/1 ya rige ese día; el del 4/1 a las 00:00 no afecta al 3/1.
    expect(out.get(SUPER)!.map(o => o.value)).toEqual([null, 100, 100, 100, 100]);
    const withStation1 = await bookOf([{ station: 1, price: 110, at: '2024-01-02 23:59' }, { station: 2, price: 110, at: '2024-01-01 08:00' }, { station: 3, price: 130, at: '2024-01-01 08:00' }]);
    expect(computeDaily(withStation1, '2024-01-01', '2024-01-02').get(SUPER)!.map(o => [o.value, o.n])).toEqual([[null, 2], [110, 3]]);
  });

  it('excluye la estación cuyo último precio tiene más de 90 días', async () => {
    const book = await bookOf([
      { station: 1, price: 100, at: '2024-01-01 12:00' },
      { station: 2, price: 200, at: '2024-03-01 12:00' },
      { station: 3, price: 200, at: '2024-03-01 12:00' },
      { station: 4, price: 200, at: '2024-03-01 12:00' },
    ]);
    // 2024-03-31 = 1/1 + 90 días (todavía vale); 2024-04-01 = 91 días (sale de la muestra).
    const out = computeDaily(book, '2024-03-31', '2024-04-01');
    expect(day(out, SUPER, '2024-03-31')).toMatchObject({ value: 200, n: 4 });
    expect(day(out, SUPER, '2024-04-01')).toMatchObject({ value: 200, n: 3 });
  });

  it('excluye precios ≤ 0 (sin volver al precio anterior) y outliers fuera de ±50% de la mediana nacional', async () => {
    const book = await bookOf([
      { station: 1, price: 100, at: '2024-01-01 10:00' },
      { station: 1, price: 0, at: '2024-01-02 10:00' },
      { station: 2, price: 100, at: '2024-01-01 10:00' },
      { station: 3, price: 102, at: '2024-01-01 10:00' },
      { station: 4, price: 104, at: '2024-01-01 10:00' },
      { station: 5, price: 150, at: '2024-01-01 10:00' },
      { station: 6, price: 1000, at: '2024-01-01 10:00' },
      { station: 7, price: 1.5, at: '2024-01-01 10:00' },
    ]);
    const out = computeDaily(book, '2024-01-01', '2024-01-02');
    // Día 1: mediana de referencia 102 → banda [51, 153]; se excluyen 1000 y 1,5.
    expect(day(out, SUPER, '2024-01-01')).toMatchObject({ value: 102, n: 5 });
    // Día 2: la estación 1 declara 0 → queda fuera (n = 4) y la mediana par promedia los dos centrales.
    expect(day(out, SUPER, '2024-01-02')).toMatchObject({ value: 103, n: 4 });
  });

  it('calcula CABA por separado y publica null si hay menos de 3 estaciones', async () => {
    const book = await bookOf([
      { station: 1, price: 100, at: '2024-01-01 10:00' },
      { station: 2, price: 100, at: '2024-01-01 10:00' },
      { station: 3, price: 120, at: '2024-01-01 10:00', province: 'CAPITAL FEDERAL' },
      { station: 4, price: 124, at: '2024-01-01 10:00', province: 'CAPITAL FEDERAL' },
      { station: 4, price: 130, at: '2024-01-02 10:00', province: 'CAPITAL FEDERAL' },
      { station: 5, price: 128, at: '2024-01-02 10:00', province: 'CAPITAL FEDERAL' },
    ]);
    const out = computeDaily(book, '2024-01-01', '2024-01-02');
    expect(day(out, SUPER_CABA, '2024-01-01')).toEqual({ date: '2024-01-01', value: null, n: 2 });
    expect(day(out, SUPER_CABA, '2024-01-02')).toEqual({ date: '2024-01-02', value: 128, n: 3 });
    expect(day(out, SUPER, '2024-01-02')).toEqual({ date: '2024-01-02', value: 120, n: 5 });
    expect(out.get(surtidorId('premium', 'nacional'))!.every(o => o.value === null && o.n === 0)).toBe(true);
  });

  it('mediana con n par e impar', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('último día cerrado: el anterior al último evento, nunca hoy', () => {
    expect(closedLastDay(minute('2026-11-03 06:50'), '2026-11-06')).toBe('2026-11-02');
    expect(closedLastDay(minute('2026-11-06 09:00'), '2026-11-06')).toBe('2026-11-05');
    expect(closedLastDay(null, '2026-11-06')).toBeNull();
  });
});

describe('estado persistido', () => {
  it('conserva lo necesario para recalcular la ventana reciente igual que con el historial completo', async () => {
    const events: Ev[] = [];
    for (let s = 1; s <= 6; s++) {
      events.push({ station: s, price: 50, at: '2023-01-01 10:00', province: s > 3 ? 'CAPITAL FEDERAL' : 'BUENOS AIRES' });
      for (let m = 1; m <= 10; m++) events.push({ station: s, price: 100 + m * 10 + s, at: `2024-${String(m).padStart(2, '0')}-${String(s + 5).padStart(2, '0')} 1${s}:00`, province: s > 3 ? 'CAPITAL FEDERAL' : 'BUENOS AIRES' });
    }
    events.push({ station: 9, price: 70, at: '2023-06-01 10:00' });
    const full = await bookOf(events);
    const state = encodeState(full, '2024-10-31', '2024-11-01T00:00:00Z');
    expect(state.retainedFrom).toBe('2024-05-04');
    expect(Object.keys(state.events)).not.toContain('9|super');
    expect(state.caba).toEqual(['4', '5', '6']);
    // Antes del corte se guarda solo el último evento previo.
    expect(state.events['1|super']!.split(';')[0]).toBe('2024-04-06 11:00=141');
    const restored = decodeState(JSON.parse(JSON.stringify(state)));
    expect(computeDaily(restored, '2024-05-04', '2024-10-31')).toEqual(computeDaily(full, '2024-05-04', '2024-10-31'));
  });
});
