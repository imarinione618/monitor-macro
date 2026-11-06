import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Observation } from '../../src/core/types';
import {
  combineIpcba,
  fetchIpcba,
  fetchRestaurantes,
  IDECBA_CHART_SOURCE,
  IDECBA_SOURCE_LABEL,
  idecbaSlug,
  IPCBA_APERTURAS,
  IPCBA_FILES,
  parseIpcbaAperturas,
  parseIpcbaBienesServicios,
  parseIpcbaEstacionalesRegulados,
  parseIpcbaNivelGeneral,
  parseMarkedValue,
  parseRestaurantes,
  parseTitleRange,
  RESTAURANTES_FILE,
  resolveIdecbaFile,
  spanishMonth,
  type ParsedFeedPart,
} from '../../src/external/idecba';
import { readXlsx } from '../../src/external/xlsx';
import { buildXlsx, rezip, type CellSpec } from './xlsx-writer';

const FIX = path.resolve(__dirname, '../fixtures/real/idecba');
const fixture = (file: string) => new Uint8Array(fs.readFileSync(path.join(FIX, `${file}.xlsx`)));
const wbOf = (file: string) => readXlsx(fixture(file));

function assertWellFormed(series: Observation[]) {
  for (let i = 1; i < series.length; i++) expect(series[i]!.period > series[i - 1]!.period).toBe(true);
  for (const o of series) {
    expect(o.period).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    if (o.value === null) expect(o.flags?.length).toBeGreaterThan(0);
  }
}

// ------------------------------------------------------------------ utilidades

describe('utilidades', () => {
  it('constantes de fuente', () => {
    expect(IDECBA_SOURCE_LABEL).toBe('IDECBA (Instituto de Estadística y Censos de la Ciudad de Buenos Aires)');
    expect(IDECBA_CHART_SOURCE).toBe('Fuente: one618 en base a IDECBA.');
  });

  it('meses en español', () => {
    expect(spanishMonth('Septiembre')).toBe(9);
    expect(spanishMonth('setiembre')).toBe(9);
    expect(spanishMonth(' ENERO ')).toBe(1);
    expect(spanishMonth('Sept')).toBeNull();
  });

  it('rango del título', () => {
    expect(parseTitleRange('IPCBA … Ciudad de Buenos Aires. Julio de 2012 / octubre de 2026')).toEqual({ first: '2012-07', last: '2026-10' });
    expect(parseTitleRange('… Buenos Aires. Marzo 2015 / Septiembre 2026.')).toEqual({ first: '2015-03', last: '2026-09' });
    expect(parseTitleRange('Sin período')).toBeNull();
  });

  it('signos convencionales', () => {
    expect(parseMarkedValue(154.96, 'x')).toEqual({ value: 154.96, flags: [] });
    expect(parseMarkedValue('///', 'x')).toEqual({ value: null, flags: ['no_corresponde'] });
    expect(parseMarkedValue('...', 'x')).toEqual({ value: null, flags: ['no_disponible'] });
    // "-" no es cero absoluto en estos archivos: nunca se convierte en 0.
    expect(parseMarkedValue('-', 'x')).toEqual({ value: null, flags: ['no_disponible'] });
    expect(parseMarkedValue('12,5*', 'x')).toEqual({ value: 12.5, flags: ['provisorio'] });
    expect(() => parseMarkedValue(null, 'B7')).toThrow(/celda vacía.*B7/);
    expect(() => parseMarkedValue('s/d', 'B7')).toThrow(/no reconocido "s\/d"/);
  });

  it('slug = nombre en minúsculas sin extensión', () => {
    expect(idecbaSlug('IPCBA_base_2021100-Nivel_general_empalme.xlsx')).toBe('ipcba_base_2021100-nivel_general_empalme');
    expect(idecbaSlug(RESTAURANTES_FILE)).toBe('ee_indice_actividad_restaurante');
  });
});

// ------------------------------------------------------------------ fixtures reales

describe('IPCBA (fixtures reales, publicación de noviembre 2026)', () => {
  const parts = {
    nivelGeneral: parseIpcbaNivelGeneral(wbOf(IPCBA_FILES.nivelGeneral)),
    aperturas: parseIpcbaAperturas(wbOf(IPCBA_FILES.aperturas)),
    bienesServicios: parseIpcbaBienesServicios(wbOf(IPCBA_FILES.bienesServicios)),
    estacionalesRegulados: parseIpcbaEstacionalesRegulados(wbOf(IPCBA_FILES.estacionalesRegulados)),
  };

  it('nivel general empalmado (vertical) desde 2012-07', () => {
    const ng = parts.nivelGeneral.series.nivel_general!;
    expect(ng).toHaveLength(172);
    expect(ng[0]).toEqual({ period: '2012-07', value: 6.4363876898803678 });
    expect(ng.at(-1)).toEqual({ period: '2026-10', value: 2695 });
    assertWellFormed(ng);
  });

  it('aperturas (formato ancho) desde 2022-02', () => {
    const ap = parts.aperturas;
    expect(ap.first).toBe('2022-02');
    expect(ap.last).toBe('2026-10');
    expect(Object.keys(ap.series)).toHaveLength(15);
    expect(ap.series.alimentos_bebidas_no_alcoholicas![0]).toEqual({ period: '2022-02', value: 132.39 });
    expect(ap.series.restaurantes_hoteles!.at(-1)).toEqual({ period: '2026-10', value: 3116.54 });
    expect(ap.series.servicios_alimentos_bebidas_fuera_hogar!.at(-1)).toEqual({ period: '2026-10', value: 3272.64 });
  });

  it('combina, valida el nivel general entre hojas y arma 20 series', () => {
    const series = combineIpcba(parts);
    expect(Object.keys(series)).toEqual([
      'nivel_general', 'bienes', 'servicios', 'estacionales', 'regulados', 'resto_ipcba', ...IPCBA_APERTURAS.map(a => a.key),
    ]);
    expect(series.bienes!.at(-1)).toEqual({ period: '2026-10', value: 2318.42 });
    expect(series.servicios!.at(-1)).toEqual({ period: '2026-10', value: 2961.22 });
    expect(series.estacionales!.at(-1)).toEqual({ period: '2026-10', value: 1830.63 });
    expect(series.regulados!.at(-1)).toEqual({ period: '2026-10', value: 3266.61 });
    expect(series.resto_ipcba!.at(-1)).toEqual({ period: '2026-10', value: 2669.52 });
    for (const s of Object.values(series)) assertWellFormed(s);
  });

  it('error si el nivel general difiere entre hojas', () => {
    const bad = rezip(fixture(IPCBA_FILES.aperturas), {
      'xl/worksheets/sheet1.xml': s => s.replace(/(<c r="BF4"[^>]*><v>)2695(<\/v>)/, '$12695.01$2'),
    });
    const p = { ...parts, aperturas: parseIpcbaAperturas(readXlsx(bad)) };
    expect(() => combineIpcba(p)).toThrow(/no coincide entre hojas en 2026-10 \(empalme=2695, aperturas=2695.01\)/);
  });

  it('error si los archivos no tienen el mismo último período', () => {
    const cut = (part: ParsedFeedPart): ParsedFeedPart => ({
      ...part,
      last: '2026-09',
      series: Object.fromEntries(Object.entries(part.series).map(([k, v]) => [k, v.slice(0, -1)])),
    });
    expect(() => combineIpcba({ ...parts, bienesServicios: cut(parts.bienesServicios) })).toThrow(/no están sincronizados.*bienesServicios=2026-09/);
  });

  it('error si falta una división o cambia un encabezado', () => {
    const renamed = rezip(fixture(IPCBA_FILES.aperturas), { 'xl/sharedStrings.xml': s => s.replace('>Educación</t>', '>Educación formal</t>') });
    expect(() => parseIpcbaAperturas(readXlsx(renamed))).toThrow(/falta la apertura "Educación"/);
    const header = rezip(fixture(IPCBA_FILES.bienesServicios), { 'xl/sharedStrings.xml': s => s.replace('>Servicios</t>', '>Servicios públicos</t>') });
    expect(() => parseIpcbaBienesServicios(readXlsx(header))).toThrow(/encabezado inesperado "Servicios públicos"/);
  });

  it('error si el período del título no coincide con los datos', () => {
    const bad = rezip(fixture(IPCBA_FILES.nivelGeneral), { 'xl/sharedStrings.xml': s => s.replace('Julio de 2012 / octubre de 2026', 'Julio de 2012 / noviembre de 2026') });
    expect(() => parseIpcbaNivelGeneral(readXlsx(bad))).toThrow(/título indica 2012-07 a 2026-11 pero los datos van de 2012-07 a 2026-10/);
  });

  it('error si la variación publicada no cierra con los índices (columnas corridas)', () => {
    const bad = rezip(fixture(IPCBA_FILES.estacionalesRegulados), {
      'xl/worksheets/sheet1.xml': s => s.replace(/(<c r="C61"[^>]*><v>)[^<]*(<\/v>)/, '$11900$2'),
    });
    expect(() => parseIpcbaEstacionalesRegulados(readXlsx(bad))).toThrow(/variación calculada .* no coincide con la publicada \(3.3%\)/);
  });
});

describe('Restaurantes (fixture real, publicación de octubre 2026)', () => {
  const parsed = parseRestaurantes(wbOf(RESTAURANTES_FILE));
  const s = parsed.series.indice_actividad!;
  const at = (p: string) => s.find(o => o.period === p);

  it('serie ascendente 2015-03 … 2026-09 con último dato provisorio', () => {
    expect(Object.keys(parsed.series)).toEqual(['indice_actividad']);
    expect(s).toHaveLength(139);
    expect(s[0]).toEqual({ period: '2015-03', value: 100 });
    expect(s.at(-1)).toEqual({ period: '2026-09', value: 154.962488504314, flags: ['provisorio'] });
    expect(at('2026-08')!.flags).toEqual(['provisorio']);
    expect(at('2026-07')!.flags).toBeUndefined();
    assertWellFormed(s);
  });

  it('abril–octubre 2020 = null "no corresponde"; marzo 2020 con llamada 1', () => {
    for (const m of ['04', '05', '06', '07', '08', '09', '10']) expect(at(`2020-${m}`)).toEqual({ period: `2020-${m}`, value: null, flags: ['no_corresponde'] });
    expect(at('2020-03')!.value).toBeCloseTo(82.98212347355583, 12);
    expect(at('2020-03')!.flags).toEqual(['provisorio']);
    expect(at('2020-03')!.rawNote).toMatch(/aislamiento social, preventivo y obligatorio/);
    expect(at('2020-11')!.value).toBeCloseTo(52.518221237067564, 12);
  });

  it('error si cambian encabezados', () => {
    const bad = rezip(fixture(RESTAURANTES_FILE), { 'xl/sharedStrings.xml': x => x.replace('>variación intermensual</t>', '>var. mensual</t>') });
    expect(() => parseRestaurantes(readXlsx(bad))).toThrow(/"variación intermensual"/);
  });
});

// ------------------------------------------------------------------ restaurantes sintético

const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
type RestEntry = { p: string; v: number | string; mark?: string };

function restSheet(entries: RestEntry[], o: { notes?: string[]; title?: string; mutate?: (rows: CellSpec[][]) => void } = {}): Uint8Array {
  const by = new Map(entries.map(e => [e.p, e]));
  const num = (e?: RestEntry) => (e && typeof e.v === 'number' ? e.v : null);
  const prev = (p: string, n: number) => {
    let y = Number(p.slice(0, 4));
    let m = Number(p.slice(5)) - n;
    while (m < 1) { m += 12; y--; }
    return `${y}-${String(m).padStart(2, '0')}`;
  };
  const vr = (cur: number | null, base: number | null): CellSpec => (cur === null || base === null ? '-' : (cur / base - 1) * 100);
  const last = entries.at(-1)!.p;
  const rows: CellSpec[][] = [
    [null, o.title ?? `Actividad en Restaurantes tradicionales. Índice de volumen físico. (Base marzo 2015=100). Ciudad Autónoma de Buenos Aires. Marzo 2015 / ${MES[Number(last.slice(5)) - 1]} ${last.slice(0, 4)}.`],
    [null, 'Período ', 'índice ', 'variación intermensual', 'variación interanual'],
    [],
  ];
  const years = [...new Set(entries.map(e => Number(e.p.slice(0, 4))))].sort((a, b) => b - a);
  for (const y of years) {
    rows.push([null, y], []);
    for (const e of entries.filter(x => Number(x.p.slice(0, 4)) === y).reverse()) {
      rows.push([null, `${MES[Number(e.p.slice(5)) - 1]}${e.mark ?? ''}`, e.v, vr(num(e), num(by.get(prev(e.p, 1)))), vr(num(e), num(by.get(prev(e.p, 12))))]);
    }
    rows.push([]);
  }
  for (const n of o.notes ?? ['* datos provisorios', '1 Llamada de prueba.', '///  Dato que no corresponde presentar.', 'Fuente: IDECBA. EREST']) rows.push([null, n]);
  o.mutate?.(rows);
  return buildXlsx([{ name: 'EE_indice_actividad_restaurante', rows }, { name: 'Ficha técnica', rows: [['FICHA TECNICA']] }]);
}

function months(from: string, n: number, f: (i: number, p: string) => Partial<RestEntry> = () => ({})): RestEntry[] {
  const out: RestEntry[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5));
  for (let i = 0; i < n; i++) {
    const p = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ p, v: i === 0 ? 100 : 100 + i * 1.37, ...f(i, p) });
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

describe('parseRestaurantes (sintético)', () => {
  it('orden descendente, meses en español, "*", "*1" y "///"', () => {
    const entries = months('2015-03', 16, (i, p) => (p === '2015-07' ? { v: '///' } : p === '2015-08' ? { mark: '*1' } : i >= 14 ? { mark: '*' } : {}));
    const r = parseRestaurantes(readXlsx(restSheet(entries))).series.indice_actividad!;
    expect(r.map(o => o.period)).toEqual(entries.map(e => e.p));
    expect(r.find(o => o.period === '2015-07')).toEqual({ period: '2015-07', value: null, flags: ['no_corresponde'] });
    expect(r.find(o => o.period === '2015-08')).toMatchObject({ flags: ['provisorio'], rawNote: '1 Llamada de prueba.' });
    expect(r.at(-1)).toMatchObject({ period: '2016-06', flags: ['provisorio'] });
    expect(r.at(-1)!.value).toBeCloseTo(100 + 15 * 1.37, 12);
  });

  const ok = months('2015-03', 14);
  const parse = (bytes: Uint8Array) => () => parseRestaurantes(readXlsx(bytes));
  const findRow = (rows: CellSpec[][], label: string, year?: number) => {
    let inYear = year === undefined;
    return rows.findIndex(r => {
      if (typeof r[1] === 'number') inYear = year === undefined || r[1] === year;
      return inYear && r[1] === label;
    });
  };

  it('mes mal escrito', () => {
    expect(parse(restSheet(ok, { mutate: rows => { rows[findRow(rows, 'Abril', 2016)]![1] = 'Abrl'; } }))).toThrow(/texto inesperado "Abrl"/);
  });

  it('meses fuera de orden descendente', () => {
    expect(parse(restSheet(ok, {
      mutate: rows => {
        const a = findRow(rows, 'Agosto', 2015);
        const b = findRow(rows, 'Julio', 2015);
        [rows[a], rows[b]] = [rows[b]!, rows[a]!];
      },
    }))).toThrow(/fuera de orden descendente/);
  });

  it('variación publicada que no cierra', () => {
    expect(parse(restSheet(ok, { mutate: rows => { rows[findRow(rows, 'Abril', 2016)]![3] = 9.99; } }))).toThrow(/2016-04 \(variación intermensual\).*no coincide/);
    expect(parse(restSheet(ok, { mutate: rows => { rows[findRow(rows, 'Abril', 2016)]![4] = 1; } }))).toThrow(/2016-04 \(variación interanual\).*no coincide/);
  });

  it('variación publicada sin índices para calcularla', () => {
    expect(parse(restSheet(ok, { mutate: rows => { rows[findRow(rows, 'Marzo', 2015)]![3] = 1; } }))).toThrow(/2015-03 \(variación intermensual\).*no índices/);
  });

  it('título sin el período o con otro período', () => {
    expect(parse(restSheet(ok, { title: 'Actividad en Restaurantes tradicionales. Índice de volumen físico. (Base marzo 2015=100). Ciudad Autónoma de Buenos Aires.' }))).toThrow(/no termina con el período/);
    expect(parse(restSheet(ok, { title: 'Actividad en Restaurantes tradicionales. Índice de volumen físico. (Base marzo 2015=100). Ciudad Autónoma de Buenos Aires. Marzo 2015 / Mayo 2016.' }))).toThrow(/título indica 2015-03 a 2016-05/);
    expect(parse(restSheet(ok, { title: 'Actividad en bares. Índice de volumen físico. (Base marzo 2015=100). Ciudad Autónoma de Buenos Aires. Marzo 2015 / Abril 2016.' }))).toThrow(/no contiene "Actividad en Restaurantes tradicionales"/);
  });

  it('marcas sin nota que las defina', () => {
    const prov = months('2015-03', 14, i => (i === 13 ? { mark: '*' } : {}));
    expect(parse(restSheet(prov, { notes: ['Fuente: IDECBA'] }))).toThrow(/falta la nota "\* datos provisorios"/);
    const call = months('2015-03', 14, i => (i === 5 ? { mark: '2' } : {}));
    expect(parse(restSheet(call))).toThrow(/llamada "2" de 2015-08 no tiene nota/);
  });

  it('datos después de las notas y huecos entre años', () => {
    expect(parse(restSheet(ok, { mutate: rows => rows.push([null, 'Mayo', 120, 1, 1]) }))).toThrow(/después de las notas/);
    const gap = months('2015-03', 26).filter(e => !e.p.startsWith('2016'));
    expect(parse(restSheet(gap))).toThrow(/orden descendente consecutivo \(2017 → 2015/);
  });

  it('base marzo 2015 distinta de 100', () => {
    const e = months('2015-03', 14);
    e[0]!.v = 99;
    expect(parse(restSheet(e))).toThrow(/marzo 2015 debería ser 100/);
  });
});

// ------------------------------------------------------------------ IPCBA sintético

const d = (p: string): CellSpec => ({ date: `${p}-01` });

describe('IPCBA sintético (layouts vertical y ancho)', () => {
  const vertical = (rows: Array<[CellSpec, CellSpec]>, title = 'IPCBA (base 2021 = 100). Nivel General. Índice mensual empalmado con la serie anterior (base julio 2011 - junio 2012 = 100). Ciudad de Buenos Aires. Julio de 2012 / septiembre de 2012') =>
    readXlsx(buildXlsx([{ name: 'Nivel_general_empalme', rows: [[title], [], ['Mes', 'Índice1'], [null, 'Nivel General'], ...rows, ['1 Base 2021 = 100.'], ['Fuente: IDECBA.']] }]));

  it('vertical: lee fechas serial y valores', () => {
    const r = parseIpcbaNivelGeneral(vertical([[d('2012-07'), 6.43], [d('2012-08'), 6.58], [d('2012-09'), '///']]));
    expect(r.series.nivel_general).toEqual([
      { period: '2012-07', value: 6.43 },
      { period: '2012-08', value: 6.58 },
      { period: '2012-09', value: null, flags: ['no_corresponde'] },
    ]);
  });

  it('vertical: huecos, fechas que no son día 1, celdas vacías', () => {
    expect(() => parseIpcbaNivelGeneral(vertical([[d('2012-07'), 1], [d('2012-09'), 2]], 'IPCBA (base 2021 = 100). Nivel General empalmado. Julio de 2012 / septiembre de 2012'))).toThrow(/se esperaba 2012-08 después de 2012-07/);
    expect(() => parseIpcbaNivelGeneral(vertical([[{ date: '2012-07-15' }, 1]]))).toThrow(/no es el primer día del mes/);
    expect(() => parseIpcbaNivelGeneral(vertical([[d('2012-07'), 1], [d('2012-08'), null], [d('2012-09'), 3]]))).toThrow(/celda vacía/);
    expect(() => parseIpcbaNivelGeneral(vertical([[d('2012-07'), 1], ['Nota', null], [d('2012-08'), 2]]))).toThrow(/después de las notas/);
  });

  const wide = (header: CellSpec[], extraRows: CellSpec[][] = []) => {
    const names = ['Nivel General', ...IPCBA_APERTURAS.map(a => a.label)];
    const rows: CellSpec[][] = [
      ['IPCBA (base 2021 = 100) según principales aperturas. Índice mensual. Ciudad de Buenos Aires. Febrero de 2022 / abril de 2022'],
      ['Apertura', 'Índice ¹'],
      [null, ...header],
      ...names.map((n, i) => [n, 100 + i, 101 + i, 102 + i]),
      ...extraRows,
      ['¹ Base 2021 = 100.'],
    ];
    return readXlsx(buildXlsx([{ name: 'Principales_aperturas_indices', rows }]));
  };

  it('ancho: fila de fechas y aperturas por nombre', () => {
    const r = parseIpcbaAperturas(wide([d('2022-02'), d('2022-03'), d('2022-04')]));
    expect(r.series.nivel_general!.map(o => o.value)).toEqual([100, 101, 102]);
    expect(r.series.servicios_alimentos_bebidas_fuera_hogar).toEqual([
      { period: '2022-02', value: 114 },
      { period: '2022-03', value: 115 },
      { period: '2022-04', value: 116 },
    ]);
  });

  it('ancho: fechas como texto, aperturas duplicadas', () => {
    expect(() => parseIpcbaAperturas(wide(['feb-22', 'mar-22', 'abr-22']))).toThrow(/se esperaba una fecha/);
    expect(() => parseIpcbaAperturas(wide([d('2022-02'), d('2022-03'), d('2022-04')], [['Salud', 1, 2, 3]]))).toThrow(/apertura duplicada "Salud"/);
  });
});

// ------------------------------------------------------------------ red (fetch simulado)

type Route = (url: string) => Response | Promise<Response>;

function fakeFetch(routes: Record<string, Route>, log: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    log.push(url);
    for (const [k, r] of Object.entries(routes)) if (url.includes(k)) return r(url);
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

const fileUrl = (f: string, month = '09') => `https://www.estadisticaciudad.gob.ar/eyc/wp-content/uploads/2026/${month}/${f}.xlsx`;
const media = (items: unknown[]) => () => Response.json(items);
const xlsxRoute = (file: string) => () => new Response(fixture(file), { status: 200, headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });

function ipcbaRoutes(): Record<string, Route> {
  const routes: Record<string, Route> = {};
  for (const f of Object.values(IPCBA_FILES)) {
    routes[`slug=${idecbaSlug(f)}&`] = media([{ slug: idecbaSlug(f), source_url: fileUrl(f), modified: '2026-11-06T11:00:00' }]);
    routes[fileUrl(f)] = xlsxRoute(f);
  }
  return routes;
}

describe('fetchIpcba / fetchRestaurantes (sin red)', () => {
  const now = () => new Date('2026-11-06T15:00:00Z');

  it('fetchIpcba resuelve URLs por slug y arma el FeedResult', async () => {
    const log: string[] = [];
    const r = await fetchIpcba({ fetch: fakeFetch(ipcbaRoutes(), log), now });
    expect(r.feed).toBe('idecba_ipcba');
    expect(r.retrievedAt).toBe('2026-11-06T15:00:00.000Z');
    expect(r.sourceUrl).toBe(fileUrl(IPCBA_FILES.nivelGeneral));
    expect(r.files).toHaveLength(4);
    expect(log.filter(u => u.includes('/wp-json/wp/v2/media?slug='))).toHaveLength(4);
    expect(Object.keys(r.series)).toHaveLength(20);
    expect(r.info.map(i => i.key)).toEqual(Object.keys(r.series));
    for (const i of r.info) {
      expect(i).toMatchObject({ measure: 'index', unit: 'Índice base 2021=100', base: '2021=100', coverage: 'Ciudad Autónoma de Buenos Aires' });
      expect(i.notes!.length).toBeGreaterThan(0);
    }
    expect(r.series.nivel_general!.at(-1)).toEqual({ period: '2026-10', value: 2695 });
  });

  it('fetchRestaurantes usa la versión más reciente por "modified"', async () => {
    const slug = idecbaSlug(RESTAURANTES_FILE);
    const r = await fetchRestaurantes({
      now,
      fetch: fakeFetch({
        [`slug=${slug}&`]: media([
          { slug, source_url: fileUrl(RESTAURANTES_FILE, '07'), modified: '2026-09-08T10:00:00' },
          { slug, source_url: fileUrl(RESTAURANTES_FILE, '08'), modified: '2026-10-08T14:38:00' },
        ]),
        [fileUrl(RESTAURANTES_FILE, '08')]: xlsxRoute(RESTAURANTES_FILE),
      }),
    });
    expect(r.feed).toBe('idecba_restaurantes');
    expect(r.sourceUrl).toBe(fileUrl(RESTAURANTES_FILE, '08'));
    expect(r.info).toEqual([expect.objectContaining({ key: 'indice_actividad', unit: 'Índice base marzo 2015=100', base: 'marzo 2015=100', measure: 'index' })]);
    expect(r.series.indice_actividad!.at(-1)).toMatchObject({ period: '2026-09', value: 154.962488504314 });
  });

  it('errores de red y de contenido', async () => {
    const slug = idecbaSlug(RESTAURANTES_FILE);
    await expect(fetchRestaurantes({ fetch: fakeFetch({ [`slug=${slug}&`]: media([]) }) })).rejects.toThrow(/no se encontró el archivo "EE_indice_actividad_restaurante"/);
    await expect(resolveIdecbaFile(RESTAURANTES_FILE, { fetch: fakeFetch({ 'slug=': media([{ slug, source_url: 'https://evil.example.com/x.xlsx', modified: '2026-10-08T00:00:00' }]) }) })).rejects.toThrow(/URL inesperada/);
    await expect(fetchRestaurantes({
      fetch: fakeFetch({
        'slug=': media([{ slug, source_url: fileUrl(RESTAURANTES_FILE), modified: '2026-10-08T00:00:00' }]),
        [fileUrl(RESTAURANTES_FILE)]: () => new Response('<html>Mantenimiento</html>', { status: 200 }),
      }),
    })).rejects.toThrow(/no es un XLSX válido/);
    await expect(fetchRestaurantes({ fetch: fakeFetch({ 'slug=': () => new Response('nope', { status: 403 }) }) })).rejects.toThrow(/HTTP 403/);
  });

  it('reintenta ante HTTP 5xx', async () => {
    let calls = 0;
    const slug = idecbaSlug(RESTAURANTES_FILE);
    const src = await resolveIdecbaFile(RESTAURANTES_FILE, {
      retries: 1,
      fetch: fakeFetch({ 'slug=': () => (++calls === 1 ? new Response('', { status: 503 }) : Response.json([{ slug, source_url: fileUrl(RESTAURANTES_FILE), modified: '2026-10-08T14:38:00' }])) }),
    });
    expect(calls).toBe(2);
    expect(src.url).toBe(fileUrl(RESTAURANTES_FILE));
  });

  it('falla (no devuelve parciales) si un archivo del IPCBA está desfasado', async () => {
    const routes = ipcbaRoutes();
    const f = IPCBA_FILES.bienesServicios;
    const stale = rezip(fixture(f), {
      'xl/worksheets/sheet1.xml': s => s.replace(/<row r="61"[\s\S]*?<\/row>/, ''),
      'xl/sharedStrings.xml': s => s.replace('Febrero de 2022 / octubre de 2026', 'Febrero de 2022 / septiembre de 2026'),
    });
    routes[fileUrl(f)] = () => new Response(new Uint8Array(stale), { status: 200 });
    await expect(fetchIpcba({ fetch: fakeFetch(routes) })).rejects.toThrow(/no están sincronizados/);
  });
});
