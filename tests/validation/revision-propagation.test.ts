/**
 * "Una revisión llega a ambos productos".
 *
 * Sobre una COPIA temporal del store real se simula lo que hace una corrida de
 * ingesta cuando el INDEC revisa un dato:
 *   1. cambia el valor de un período ya publicado (IPC nacional y exportaciones);
 *   2. se detecta como revisión (detectRevisions) y se registra en revisions.jsonl;
 *   3. se recalculan las derivadas que dependen de esas series (saldo y salario real)
 *      con la misma función que usa la ingesta (buildDerivedSeries).
 * Luego se verifica que Google Sheets (planTopic → DATOS/CALCULOS, vía
 * loadStoreSource) y el dashboard (getClientSeries → buildChartModel) muestran el
 * valor nuevo. Ambos pasan por buildWideTable (src/core/views.ts).
 *
 * El store real NO se modifica (se verifica). Se saltea si no hay store real.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { periodToSheetsSerial } from '../../src/core/periods';
import { getSeries, SERIES } from '../../src/core/registry';
import { appendRevisions, readRevisions, readSeriesData, writeSeriesData } from '../../src/core/store';
import type { SeriesData } from '../../src/core/types';
import { buildWideTable, columnKey } from '../../src/core/views';
import { buildDerivedSeries } from '../../src/ingest/normalize';
import { detectRevisions } from '../../src/ingest/revisions';
import { calcTabKey, dataTabKey, planTopic, type TopicPlan } from '../../src/sheets/layout';
import { loadStoreSource } from '../../src/sheets/source';
import { copyStoreToTmp, REAL_STORE_DIR, requireRealStore } from './helpers';

const st = requireRealStore('revisión llega a Sheets y dashboard');

const IPC = 'precios.ipc.ng.nacional';
const EXPO = 'comex.expo.total';
const NOW = new Date('2026-11-04T15:00:00Z');

function sha(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Valor de una celda de un plan de Sheets por pestaña, clave de columna y período. */
function sheetCell(plan: TopicPlan, tabKey: string, colKey: string, period: string): number | null | undefined {
  const tab = plan.tabs.find((t) => t.key === tabKey);
  if (!tab) throw new Error(`No existe la pestaña ${tabKey}`);
  const c = tab.grid[0]!.indexOf(colKey);
  if (c < 0) throw new Error(`No existe la columna ${colKey} en ${tabKey}`);
  const row = tab.grid.slice(2).find((r) => r[0] === periodToSheetsSerial(period));
  return row ? (row[c] as number | null) : undefined;
}

describe.skipIf(!st.ok)('revisión simulada en una copia del store real', () => {
  const realFiles = [IPC, EXPO, 'comex.saldo'].map((id) => path.join(REAL_STORE_DIR, 'series', `${id}.json`));
  const realHashes = st.ok ? realFiles.map(sha) : [];
  const tmp = st.ok ? copyStoreToTmp() : '';
  const prevStoreDir = process.env.STORE_DIR;
  const prevDataMode = process.env.DATA_MODE;

  afterAll(() => {
    if (prevStoreDir === undefined) delete process.env.STORE_DIR;
    else process.env.STORE_DIR = prevStoreDir;
    if (prevDataMode === undefined) delete process.env.DATA_MODE;
    else process.env.DATA_MODE = prevDataMode;
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  // ---- 1-3: aplicar la revisión como lo haría la ingesta
  let ipcPeriod = '', ipcOld = 0, ipcNew = 0, ipcPrev = 0;
  let expoPeriod = '', saldoNew = 0;
  const revise = (id: string, pick: (d: SeriesData) => number, factor: number) => {
    const before = readSeriesData(id, tmp)!;
    const after: SeriesData = structuredClone(before);
    const i = pick(after);
    const o = after.observations[i]!;
    const old = o.value!;
    o.value = old * factor;
    const recs = detectRevisions(id, before.observations, after.observations, { runId: 'test-revision', detectedAt: NOW.toISOString() });
    writeSeriesData(after, tmp);
    appendRevisions(recs, tmp);
    return { period: o.period, old, neu: o.value, prev: after.observations[i - 1]!.value!, recs };
  };
  const rebuildDerived = (ids: string[]) => {
    for (const id of ids) {
      const def = getSeries(id);
      const b = buildDerivedSeries(def, (dep) => readSeriesData(dep, tmp)?.observations ?? null);
      expect(b.issues).toEqual([]);
      const cur = readSeriesData(id, tmp)!;
      writeSeriesData({ ...cur, observations: b.observations }, tmp);
    }
  };

  it('la revisión se detecta y queda en revisions.jsonl de la copia', () => {
    // IPC: se revisa (+0,5 %) el último mes que también tiene salario real (los salarios
    // se publican con más rezago que el IPC, así que suele no ser el anteúltimo) → cambian
    // su nivel, su var. m/m y la del mes siguiente.
    const lastRealPeriod = readSeriesData('laboral.salarios.registrado_real', tmp)!.observations.at(-1)!.period;
    const r1 = revise(IPC, (d) => {
      const i = d.observations.findIndex((o) => o.period === lastRealPeriod);
      expect(i).toBeGreaterThan(0);
      return Math.min(i, d.observations.length - 2);
    }, 1.005);
    ipcPeriod = r1.period;
    ipcOld = r1.old;
    ipcNew = r1.neu;
    ipcPrev = r1.prev;
    // Exportaciones: se revisa el último mes (+1 %).
    const r2 = revise(EXPO, (d) => d.observations.length - 1, 1.01);
    expoPeriod = r2.period;
    expect(r1.recs).toEqual([expect.objectContaining({ seriesId: IPC, period: ipcPeriod, oldValue: ipcOld, newValue: ipcNew, kind: 'revised' })]);
    expect(r2.recs).toHaveLength(1);
    rebuildDerived(['comex.saldo', ...SERIES.filter((s) => s.family === 'salarios_reales').map((s) => s.id)]);
    const x = readSeriesData(EXPO, tmp)!.observations.at(-1)!.value!;
    const m = readSeriesData('comex.impo.total', tmp)!.observations.at(-1)!.value!;
    saldoNew = readSeriesData('comex.saldo', tmp)!.observations.at(-1)!.value!;
    expect(saldoNew).toBeCloseTo(x - m, 9);
    const revs = readRevisions(tmp);
    expect(revs.filter((r) => r.runId === 'test-revision')).toHaveLength(2);
  });

  it('Google Sheets (loadStoreSource → planTopic) refleja el valor revisado en DATOS y CALCULOS', () => {
    const source = loadStoreSource(tmp);
    const precios = planTopic({ topic: 'precios', source, now: NOW });
    const dTab = dataTabKey('ipc_nivel_general', 'M');
    const cTab = calcTabKey('ipc_nivel_general', 'M');
    expect(sheetCell(precios, dTab, columnKey({ seriesId: IPC, transform: 'level' }), ipcPeriod)).toBe(ipcNew);
    expect(sheetCell(precios, cTab, columnKey({ seriesId: IPC, transform: 'pct_prev' }), ipcPeriod)).toBeCloseTo((ipcNew / ipcPrev - 1) * 100, 10);

    const comex = loadStoreSource(tmp);
    const plan = planTopic({ topic: 'comex', source: comex, now: NOW });
    expect(sheetCell(plan, dataTabKey('comercio_totales', 'M'), columnKey({ seriesId: 'comex.saldo', transform: 'level' }), expoPeriod)).toBe(saldoNew);

    // El salario real (derivada del IPC) también se recalculó.
    const lab = planTopic({ topic: 'laboral', source: loadStoreSource(tmp), now: NOW });
    const realId = 'laboral.salarios.registrado_real';
    const real = sheetCell(lab, dataTabKey('salarios_reales', 'M'), columnKey({ seriesId: realId, transform: 'level' }), ipcPeriod);
    const realOrig = readSeriesData(realId, REAL_STORE_DIR)!.observations.find((o) => o.period === ipcPeriod)!.value!;
    expect(real).toBeCloseTo(realOrig / 1.005, 8);
  });

  it('el dashboard (getClientSeries → buildChartModel) refleja el valor revisado', async () => {
    process.env.STORE_DIR = tmp;
    delete process.env.DATA_MODE;
    const { getClientSeries } = await import('../../src/web/server/store');
    const { buildChartModel } = await import('../../src/web/lib/chartModel');
    const cs = getClientSeries(IPC)!;
    expect(cs.missing).toBe(false);
    expect(cs.synthetic).toBe(false);
    expect(cs.observations.find((o) => o.period === ipcPeriod)!.value).toBe(ipcNew);

    const lvl = buildChartModel({ series: [cs], transform: 'level', range: '12m' })!;
    expect(lvl.columns[0]!.values[lvl.periods.indexOf(ipcPeriod)]).toBe(ipcNew);
    const mm = buildChartModel({ series: [cs], transform: 'pct_prev', range: '12m' })!;
    expect(mm.columns[0]!.values[mm.periods.indexOf(ipcPeriod)]).toBeCloseTo((ipcNew / ipcPrev - 1) * 100, 10);

    const saldo = getClientSeries('comex.saldo')!;
    const sm = buildChartModel({ series: [saldo], transform: 'level', range: '12m' })!;
    expect(sm.columns[0]!.values[sm.periods.indexOf(expoPeriod)]).toBe(saldoNew);
  });

  it('Sheets y dashboard dan el mismo número (misma buildWideTable)', async () => {
    const source = loadStoreSource(tmp);
    const t = buildWideTable([{ seriesId: IPC, transform: 'pct_yoy' }], getSeries, (id) => source.getData(id));
    const { getClientSeries } = await import('../../src/web/server/store');
    const { buildChartModel } = await import('../../src/web/lib/chartModel');
    const yoy = buildChartModel({ series: [getClientSeries(IPC)!], transform: 'pct_yoy', range: 'all' })!;
    const last = t.periods.at(-1)!;
    expect(yoy.columns[0]!.values[yoy.periods.indexOf(last)]).toBe(t.values[0]!.at(-1));
  });

  it('el store real quedó intacto', () => {
    expect(realFiles.map(sha)).toEqual(realHashes);
    expect(fs.existsSync(path.join(REAL_STORE_DIR, 'revisions.jsonl')) ? readRevisions(REAL_STORE_DIR).some((r) => r.runId === 'test-revision') : false).toBe(false);
  });
});
