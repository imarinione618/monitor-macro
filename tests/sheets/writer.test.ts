import { describe, expect, it } from 'vitest';
import { InMemorySheetsApi } from '../../src/sheets/memory';
import { createTopicSpreadsheet, syncTopic } from '../../src/sheets/writer';
import { MD, SHEETS_LOCALE, SHEETS_TIMEZONE, type Grid } from '../../src/sheets/types';
import { RETIRED_PREFIX, USER_TAB } from '../../src/sheets/layout';
import { periodToSheetsSerial, shiftPeriod } from '../../src/core/periods';
import { getSeries, seriesByTopic } from '../../src/core/registry';
import { buildWideTable } from '../../src/core/views';
import type { SeriesData, SeriesDef } from '../../src/core/types';
import { mutableSource, NOW } from './helpers';

const LATER = new Date('2026-11-05T12:00:00Z');

async function setup(topic: 'comex' | 'laboral' | 'precios' | 'actividad' = 'comex') {
  const api = new InMemorySheetsApi();
  const { spreadsheetId: id } = await createTopicSpreadsheet(api, topic);
  const { src, overrides } = mutableSource();
  return { api, id, src, overrides, topic };
}

function colOf(g: Grid, key: string): number {
  return g[0]!.indexOf(key);
}
function rowOf(g: Grid, period: string): number {
  return g.findIndex((r, i) => i >= 2 && r[0] === periodToSheetsSerial(period));
}
function sheetIds(api: InMemorySheetsApi, id: string) {
  return Object.fromEntries(api.doc(id).sheets.map((s) => [s.title, s.sheetId]));
}

describe('sincronización con API simulada', () => {
  it('primera sincronización crea la estructura completa', async () => {
    const { api, id, src } = await setup('comex');
    const r = await syncTopic(api, id, 'comex', src, { now: NOW });
    const doc = api.doc(id);
    const titles = doc.sheets.map((s) => s.title);
    expect(titles).toEqual(
      expect.arrayContaining(['LEEME', 'CATALOGO', 'CONTROL', 'DATOS_COMERCIO_TOTALES_M', 'CALCULOS_COMERCIO_TOTALES_M', 'EJEMPLO_GRAFICO', USER_TAB]),
    );
    expect(doc.locale).toBe(SHEETS_LOCALE);
    expect(doc.timeZone).toBe(SHEETS_TIMEZONE);
    expect(doc.developerMetadata.find((m) => m.metadataKey === MD.topic)?.metadataValue).toBe('comex');
    for (const s of doc.sheets) expect(s.developerMetadata.some((m) => m.metadataKey === MD.tab)).toBe(true);
    // gráfico de ejemplo: uno, en EJEMPLO_GRAFICO, apuntando a columnas completas de DATOS
    expect(doc.charts).toHaveLength(1);
    expect(doc.charts[0]!.anchorSheetId).toBe(api.sheet(id, 'EJEMPLO_GRAFICO').sheetId);
    const spec = doc.charts[0]!.spec as { basicChart: { domains: { domain: { sourceRange: { sources: { sheetId: number; endRowIndex?: number }[] } } }[]; series: unknown[] } };
    const src0 = spec.basicChart.domains[0]!.domain.sourceRange.sources[0]!;
    expect(src0.sheetId).toBe(api.sheet(id, 'DATOS_COMERCIO_TOTALES_M').sheetId);
    expect(src0.endRowIndex).toBeUndefined(); // rango abierto: toma períodos futuros
    expect(spec.basicChart.series).toHaveLength(2);
    expect(r.chartCreated).toBe(true);
    // pestañas de datos con filas congeladas
    expect(api.sheet(id, 'DATOS_COMERCIO_TOTALES_M').frozenRowCount).toBe(2);
  });

  it('fechas como serial numérico con formato de fecha', async () => {
    const { api, id, src } = await setup('comex');
    await syncTopic(api, id, 'comex', src, { now: NOW });
    const g = api.values(id, 'DATOS_COMERCIO_TOTALES_M');
    const first = src.getData('comex.expo.total')!.meta.firstPeriod!;
    expect(typeof g[2]![0]).toBe('number');
    expect(g[2]![0]).toBe(periodToSheetsSerial(first));
    const fmts = api.sheet(id, 'DATOS_COMERCIO_TOTALES_M').formats;
    const dateFmt = fmts.find((f) => f.repeatCell?.cell?.userEnteredFormat?.numberFormat?.type === 'DATE');
    expect(dateFmt?.repeatCell?.range).toMatchObject({ startRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 });
  });

  it('segunda sincronización idéntica no escribe nada ni duplica', async () => {
    const { api, id, src } = await setup('comex');
    await syncTopic(api, id, 'comex', src, { now: NOW });
    const before = structuredClone(api.doc(id));
    const writes = api.writeCount();
    const r2 = await syncTopic(api, id, 'comex', src, { now: NOW });
    expect(api.writeCount()).toBe(writes);
    expect(r2.tabsCreated).toEqual([]);
    expect(r2.tabsChanged).toEqual([]);
    expect(r2.chartCreated).toBe(false);
    const after = api.doc(id);
    expect(after.sheets.length).toBe(before.sheets.length);
    expect(after.charts.length).toBe(1);
    expect(after.developerMetadata.length).toBe(before.developerMetadata.length);
    for (const s of after.sheets) expect(s.values).toEqual(before.sheets.find((b) => b.sheetId === s.sheetId)!.values);

    // con otro horario solo cambia CONTROL (hora de sincronización)
    const r3 = await syncTopic(api, id, 'comex', src, { now: LATER });
    expect(r3.tabsChanged).toEqual(['CONTROL']);
    expect(api.doc(id).sheets.length).toBe(before.sheets.length);
  });

  it('una revisión histórica se refleja en la celda (DATOS y CALCULOS)', async () => {
    const { api, id, src, overrides } = await setup('comex');
    await syncTopic(api, id, 'comex', src, { now: NOW });
    const orig = src.getData('comex.expo.total')!;
    const revised: SeriesData = structuredClone(orig);
    const obs = revised.observations.find((o) => o.period === '2020-05')!;
    obs.value = 12345.678901;
    overrides.set('comex.expo.total', revised);
    const r = await syncTopic(api, id, 'comex', src, { now: NOW });
    expect(r.tabsChanged).toEqual(expect.arrayContaining(['DATOS_COMERCIO_TOTALES_M', 'CALCULOS_COMERCIO_TOTALES_M']));
    const g = api.values(id, 'DATOS_COMERCIO_TOTALES_M');
    expect(g[rowOf(g, '2020-05')]![colOf(g, 'comex.expo.total|level')]).toBe(12345.678901);
    // CALCULOS (pct_yoy 2021-05 depende de 2020-05)
    const c = api.values(id, 'CALCULOS_COMERCIO_TOTALES_M');
    const t = buildWideTable([{ seriesId: 'comex.expo.total', transform: 'pct_yoy' }], getSeries, (x) => src.getData(x));
    const expected = t.values[0]![t.periods.indexOf('2021-05')];
    expect(c[rowOf(c, '2021-05')]![colOf(c, 'comex.expo.total|pct_yoy')]).toBe(expected);
    // sin pestañas duplicadas
    expect(api.doc(id).sheets.filter((s) => s.title === 'DATOS_COMERCIO_TOTALES_M')).toHaveLength(1);
  });

  it('serie nueva se agrega al final sin reordenar; serie retirada se conserva marcada', async () => {
    const { api, id, src, overrides } = await setup('comex');
    await syncTopic(api, id, 'comex', src, { now: NOW });
    const g1 = api.values(id, 'DATOS_COMERCIO_TOTALES_M');
    const ids1 = sheetIds(api, id);

    const base = getSeries('comex.expo.total');
    const nueva: SeriesDef = { ...base, id: 'comex.expo.test_nueva', shortName: 'Expo test', priority: 2 };
    const data = structuredClone(src.getData('comex.expo.total')!);
    data.id = nueva.id;
    overrides.set(nueva.id, data);
    const defs = [...seriesByTopic('comex'), nueva];
    await syncTopic(api, id, 'comex', src, { now: NOW, defs });
    const g2 = api.values(id, 'DATOS_COMERCIO_TOTALES_M');
    expect(g2[0]!.slice(0, g1[0]!.length)).toEqual(g1[0]);
    expect(g2[0]!.at(-1)).toBe('comex.expo.test_nueva|level');
    for (let r = 2; r < g1.length; r++) expect(g2[r]!.slice(0, g1[0]!.length)).toEqual(g1[r]);
    expect(sheetIds(api, id)).toEqual(ids1);
    // CALCULOS también al final
    const c2 = api.values(id, 'CALCULOS_COMERCIO_TOTALES_M');
    expect(c2[0]!.at(-1)).toMatch(/^comex\.expo\.test_nueva\|/);

    // retirar la serie de importaciones: columna conservada, marcada y con valores
    const impoCol = colOf(g2, 'comex.impo.total|level');
    const impoVals = g2.slice(2).map((r) => r[impoCol]);
    await syncTopic(api, id, 'comex', src, { now: NOW, defs: defs.filter((d) => d.id !== 'comex.impo.total') });
    const g3 = api.values(id, 'DATOS_COMERCIO_TOTALES_M');
    expect(g3[0]).toEqual(g2[0]);
    expect(String(g3[1]![impoCol])).toMatch(new RegExp('^' + RETIRED_PREFIX.replace(/[[\]]/g, '\\$&')));
    expect(g3.slice(2).map((r) => r[impoCol])).toEqual(impoVals);
    // el gráfico de ejemplo no se duplicó
    expect(api.doc(id).charts).toHaveLength(1);
  });

  it('pestañas, gráficos y notas del usuario sobreviven', async () => {
    const { api, id, src, overrides } = await setup('comex');
    await syncTopic(api, id, 'comex', src, { now: NOW });
    // acciones manuales del usuario
    api.userAddSheet(id, 'Mi análisis', [['mis cosas', 1, 2], ['=SUMA(A1:B1)']]);
    const c1 = api.userAddChart(id, 'Mi análisis');
    const c2 = api.userAddChart(id, USER_TAB);
    const c3 = api.userAddChart(id, 'DATOS_COMERCIO_TOTALES_M'); // gráfico del usuario sobre una pestaña gestionada
    const userTab = api.sheet(id, USER_TAB);
    userTab.values = [['mis notas'], [null, 42]];
    api.sheet(id, 'DATOS_COMERCIO_TOTALES_M').notes.set('B3', 'nota del usuario');
    const ids1 = sheetIds(api, id);

    // nuevo período en el store (fuerza reescritura y expansión de grilla)
    for (const sid of ['comex.expo.total', 'comex.impo.total']) {
      const d = structuredClone(src.getData(sid)!);
      const last = d.observations.at(-1)!.period;
      d.observations.push({ period: shiftPeriod(last, 1), value: 999 });
      d.meta.lastPeriod = shiftPeriod(last, 1);
      overrides.set(sid, d);
    }
    const r = await syncTopic(api, id, 'comex', src, { now: LATER });
    expect(r.tabsChanged).toContain('DATOS_COMERCIO_TOTALES_M');
    expect(api.values(id, 'Mi análisis')).toEqual([['mis cosas', 1, 2], ['=SUMA(A1:B1)', null, null]]);
    expect(api.sheet(id, USER_TAB).values).toEqual([['mis notas'], [null, 42]]);
    expect(api.doc(id).charts.map((c) => c.chartId)).toEqual(expect.arrayContaining([c1, c2, c3]));
    expect(api.doc(id).charts).toHaveLength(4);
    expect(api.sheet(id, 'DATOS_COMERCIO_TOTALES_M').notes.get('B3')).toBe('nota del usuario');
    expect(sheetIds(api, id)).toEqual(ids1);
    const g = api.values(id, 'DATOS_COMERCIO_TOTALES_M');
    expect(g.at(-1)![colOf(g, 'comex.expo.total|level')]).toBe(999);
  });

  it('GRAFICOS_USUARIO se crea una sola vez: si el usuario la borra o renombra no se recrea', async () => {
    const { api, id, src } = await setup('laboral');
    await syncTopic(api, id, 'laboral', src, { now: NOW });
    const doc = api.doc(id);
    api.sheet(id, USER_TAB).title = 'Mis gráficos';
    await syncTopic(api, id, 'laboral', src, { now: NOW });
    expect(doc.sheets.some((s) => s.title === USER_TAB)).toBe(false);
    expect(api.sheet(id, 'Mis gráficos')).toBeTruthy();
    doc.sheets = doc.sheets.filter((s) => s.title !== 'Mis gráficos');
    const r = await syncTopic(api, id, 'laboral', src, { now: NOW });
    expect(r.tabsCreated).toEqual([]);
    expect(api.doc(id).sheets.some((s) => s.title === USER_TAB)).toBe(false);
  });

  it('el gráfico de ejemplo gestionado se recrea (una vez) si fue borrado', async () => {
    const { api, id, src } = await setup('actividad');
    await syncTopic(api, id, 'actividad', src, { now: NOW });
    const chartId = api.doc(id).charts[0]!.chartId;
    api.doc(id).charts = [];
    await syncTopic(api, id, 'actividad', src, { now: NOW });
    await syncTopic(api, id, 'actividad', src, { now: NOW });
    expect(api.doc(id).charts.map((c) => c.chartId)).toEqual([chartId]);
    const spec = api.doc(id).charts[0]!.spec as { basicChart: { series: { series: { sourceRange: { sources: { startColumnIndex: number }[] } } }[] } };
    const col = spec.basicChart.series[0]!.series.sourceRange.sources[0]!.startColumnIndex;
    expect(api.values(id, 'DATOS_EMAE_M')[0]![col]).toBe('actividad.emae.total.sa|level');
  });

  it('documento creado por el usuario (cuenta de servicio): adopta, no borra "Hoja 1"', async () => {
    const api = new InMemorySheetsApi();
    const { spreadsheetId: id } = await api.createSpreadsheet({ title: 'mi doc', locale: 'en_US', timeZone: 'UTC', firstSheet: { sheetId: 0, title: 'Hoja 1' } });
    api.sheet(id, 'Hoja 1').values = [['algo del usuario']];
    const { src } = mutableSource();
    await syncTopic(api, id, 'laboral', src, { now: NOW });
    expect(api.values(id, 'Hoja 1')).toEqual([['algo del usuario']]);
    expect(api.doc(id).locale).toBe('es_AR');
    expect(api.sheet(id, 'LEEME')).toBeTruthy();
  });

  it('no escribe un tema en el documento de otro', async () => {
    const { api, id, src } = await setup('comex');
    await syncTopic(api, id, 'comex', src, { now: NOW });
    await expect(syncTopic(api, id, 'precios', src, { now: NOW })).rejects.toThrow(/tema "comex"/);
  });

  it('troceo: requests chicas producen el mismo resultado que una sola', async () => {
    const a = await setup('precios');
    const b = await setup('precios');
    await syncTopic(a.api, a.id, 'precios', a.src, { now: NOW });
    const rb = await syncTopic(b.api, b.id, 'precios', b.src, { now: NOW, maxRequestBytes: 20_000, maxRequestsPerBatch: 7 });
    expect(rb.apiCalls.valuesBatchUpdate).toBeGreaterThan(10);
    expect(rb.apiCalls.batchUpdate).toBeGreaterThan(3);
    for (const call of b.api.calls.filter((c) => c.method === 'valuesBatchUpdate')) {
      expect(JSON.stringify(call.body).length).toBeLessThan(20_000 + 2_000);
    }
    for (const s of a.api.doc(a.id).sheets) expect(b.api.values(b.id, s.title)).toEqual(a.api.values(a.id, s.title));
  });

  it('CALCULOS en la hoja = buildWideTable, valor por valor', async () => {
    const { api, id, src } = await setup('precios');
    await syncTopic(api, id, 'precios', src, { now: NOW });
    const g = api.values(id, 'CALCULOS_IPC_NIVEL_GENERAL_M');
    const specs = g[0]!.slice(1).map((k) => {
      const [seriesId, transform] = String(k).split('|');
      return { seriesId: seriesId!, transform: transform as never };
    });
    const t = buildWideTable(specs, getSeries, (x) => src.getData(x));
    let compared = 0;
    t.periods.forEach((p, r) => {
      const row = g[rowOf(g, p)]!;
      t.columns.forEach((_, j) => {
        expect(row[j + 1] ?? null).toBe(t.values[j]![r]);
        compared++;
      });
    });
    expect(compared).toBeGreaterThan(100);
  });

  it('si se acortan los datos, se limpian las filas sobrantes del rango gestionado', async () => {
    const { api, id, src, overrides } = await setup('comex');
    await syncTopic(api, id, 'comex', src, { now: NOW });
    const rows1 = api.values(id, 'DATOS_COMERCIO_TOTALES_M').length;
    for (const d of seriesByTopic('comex')) {
      const x = structuredClone(src.getData(d.id));
      if (!x) continue;
      x.observations = x.observations.slice(0, -3);
      overrides.set(d.id, x);
    }
    const r = await syncTopic(api, id, 'comex', src, { now: NOW });
    expect(r.rangesCleared).toBeGreaterThan(0);
    expect(api.values(id, 'DATOS_COMERCIO_TOTALES_M').length).toBe(rows1 - 3);
  });
});
