/**
 * Aplica un `TopicPlan` a un spreadsheet existente en forma IDEMPOTENTE.
 *
 * Reglas:
 *  - Nunca se borra ni se reconstruye el documento; nunca se borran pestañas,
 *    filas/columnas (deleteDimension) ni gráficos. Los sheetId se conservan.
 *  - Pestañas gestionadas = las que tienen developer metadata `indec_monitor_tab`
 *    (o, si falta, una pestaña con el título reservado, que se "adopta").
 *  - GRAFICOS_USUARIO se crea una sola vez y no se vuelve a tocar.
 *  - Los valores se comparan con lo que hay en la hoja: una pestaña solo se
 *    reescribe si cambió algo (segunda corrida idéntica = 0 escrituras de datos).
 *  - Escrituras por lotes (values.batchUpdate / spreadsheets.batchUpdate),
 *    troceadas por tamaño. La grilla se expande antes de escribir.
 */
import { a1Range, gridsEqualWithin, gridWidth, quoteTitle, usedSize } from './a1';
import {
  DATE_PATTERN,
  EXAMPLE_TAB,
  HEADER_ROWS,
  USER_TAB,
  documentTitle,
  planTopic,
  type TabPlan,
  type TopicPlan,
} from './layout';
import type { DataSource } from './source';
import {
  LIMITS,
  MD,
  SHEETS_LOCALE,
  SHEETS_TIMEZONE,
  type CellValue,
  type Grid,
  type SheetInfo,
  type SheetsApi,
  type SheetsRequest,
  type ValueRangeWrite,
} from './types';
import type { SeriesDef, Topic } from '../core/types';

export interface SyncOptions {
  now?: Date;
  /** Series a usar (por defecto el registro). Para tests. */
  defs?: SeriesDef[];
  maxRequestBytes?: number;
  maxRequestsPerBatch?: number;
  runMode?: string;
  log?: (msg: string) => void;
}

export interface SyncResult {
  spreadsheetId: string;
  topic: Topic;
  tabsCreated: string[];
  tabsAdopted: string[];
  tabsChanged: string[];
  tabsUnchanged: string[];
  orphanTabs: string[];
  structuralRequests: number;
  valueRangesWritten: number;
  cellsWritten: number;
  rangesCleared: number;
  chartCreated: boolean;
  apiCalls: { batchUpdate: number; valuesBatchUpdate: number; valuesBatchClear: number; valuesBatchGet: number };
  warnings: string[];
  plan: TopicPlan;
}

// ------------------------------------------------------------------ helpers puros

/** ID entero estable (FNV-1a) evitando colisiones con `used`. Lo agrega a `used`. */
export function stableId(seed: string, used: Set<number>): number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let id = ((h >>> 0) % 1_900_000_000) + 1000;
  while (used.has(id)) id = id >= 2_000_000_000 ? 1000 : id + 1;
  used.add(id);
  return id;
}

function mdRequest(location: { spreadsheet: true } | { sheetId: number }, key: string, value: string): SheetsRequest {
  return {
    createDeveloperMetadata: {
      developerMetadata: {
        metadataKey: key,
        metadataValue: value,
        visibility: 'DOCUMENT',
        location: 'spreadsheet' in location ? { spreadsheet: true } : { sheetId: location.sheetId },
      },
    },
  };
}

/** Requests de formato de una pestaña (se aplican al crearla o cuando crece). */
export function formatRequests(tab: TabPlan, sheetId: number): SheetsRequest[] {
  const reqs: SheetsRequest[] = [];
  const width = gridWidth(tab.grid);
  if (tab.role === 'datos' || tab.role === 'calculos') {
    reqs.push(
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { fontSize: 8, foregroundColorStyle: { rgbColor: { red: 0.45, green: 0.45, blue: 0.45 } } } } },
          fields: 'userEnteredFormat.textFormat',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2 },
          cell: { userEnteredFormat: { textFormat: { bold: true }, wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } },
          fields: 'userEnteredFormat(textFormat,wrapStrategy,verticalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: HEADER_ROWS, startColumnIndex: 0, endColumnIndex: 1 },
          cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: DATE_PATTERN[tab.frequency ?? 'M'] } } },
          fields: 'userEnteredFormat.numberFormat',
        },
      },
    );
    if (width > 1) {
      reqs.push(
        {
          repeatCell: {
            range: { sheetId, startRowIndex: HEADER_ROWS, startColumnIndex: 1, endColumnIndex: width },
            cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0.00' } } },
            fields: 'userEnteredFormat.numberFormat',
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: width },
            properties: { pixelSize: 150 },
            fields: 'pixelSize',
          },
        },
      );
    }
  } else if (tab.role === 'leeme' || tab.role === 'ejemplo' || tab.role === 'control') {
    reqs.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } },
        fields: 'userEnteredFormat.textFormat',
      },
    });
    if (tab.role === 'leeme') {
      reqs.push(
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
            properties: { pixelSize: 260 },
            fields: 'pixelSize',
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
            properties: { pixelSize: 900 },
            fields: 'pixelSize',
          },
        },
        {
          repeatCell: {
            range: { sheetId, startColumnIndex: 1, endColumnIndex: 2 },
            cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
            fields: 'userEnteredFormat.wrapStrategy',
          },
        },
      );
    }
  } else if (tab.role === 'catalogo') {
    reqs.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true }, wrapStrategy: 'WRAP' } },
        fields: 'userEnteredFormat(textFormat,wrapStrategy)',
      },
    });
  }
  return reqs;
}

export function chartRequest(plan: TopicPlan, chartId: number, dataSheetId: number, anchorSheetId: number): SheetsRequest {
  const c = plan.chart!;
  // Rangos de columna completos y abiertos (sin endRowIndex) desde la fila 2 (encabezado legible).
  const col = (i: number) => ({ sourceRange: { sources: [{ sheetId: dataSheetId, startRowIndex: 1, startColumnIndex: i, endColumnIndex: i + 1 }] } });
  return {
    addChart: {
      chart: {
        chartId,
        spec: {
          title: c.title,
          basicChart: {
            chartType: c.chartType,
            legendPosition: 'BOTTOM_LEGEND',
            headerCount: 1,
            axis: [
              { position: 'BOTTOM_AXIS', title: 'Fecha' },
              { position: 'LEFT_AXIS', title: c.yAxisTitle },
            ],
            domains: [{ domain: col(0) }],
            series: c.seriesColumns.map((i) => ({ series: col(i), targetAxis: 'LEFT_AXIS' })),
          },
        },
        position: {
          overlayPosition: { anchorCell: { sheetId: anchorSheetId, rowIndex: 4, columnIndex: 0 }, widthPixels: 960, heightPixels: 440 },
        },
      },
    },
  };
}

/** Bloque de escritura con coordenadas (para trocear por filas). */
interface WriteBlock {
  title: string;
  row0: number;
  col0: number;
  values: CellValue[][];
}

function toApiValues(rows: CellValue[][], width: number): CellValue[][] {
  return rows.map((r) => {
    const out: CellValue[] = new Array(width);
    for (let i = 0; i < width; i++) {
      const v = r[i];
      out[i] = v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v)) ? '' : v;
    }
    return out;
  });
}

/**
 * Trocea escrituras en lotes de values.batchUpdate de hasta `maxBytes` (JSON aprox.).
 * Una tabla grande se divide por bloques de filas.
 */
export function chunkValueWrites(blocks: WriteBlock[], maxBytes: number): ValueRangeWrite[][] {
  const batches: ValueRangeWrite[][] = [];
  let cur: ValueRangeWrite[] = [];
  let curBytes = 0;
  const flush = () => {
    if (cur.length) batches.push(cur);
    cur = [];
    curBytes = 0;
  };
  const push = (vr: ValueRangeWrite, bytes: number) => {
    if (curBytes + bytes > maxBytes && cur.length) flush();
    cur.push(vr);
    curBytes += bytes;
  };
  for (const b of blocks) {
    const width = b.values.reduce((w, r) => Math.max(w, r.length), 0);
    if (!width || !b.values.length) continue;
    const rows = toApiValues(b.values, width);
    let start = 0;
    let bytes = 64;
    for (let i = 0; i < rows.length; i++) {
      const rb = JSON.stringify(rows[i]).length + 1;
      if (bytes + rb > maxBytes && i > start) {
        push({ range: a1Range(b.title, b.row0 + start, b.col0, b.row0 + i, b.col0 + width), values: rows.slice(start, i) }, bytes);
        start = i;
        bytes = 64;
      }
      bytes += rb;
    }
    push({ range: a1Range(b.title, b.row0 + start, b.col0, b.row0 + rows.length, b.col0 + width), values: rows.slice(start) }, bytes);
  }
  flush();
  return batches;
}

/** Trocea requests de spreadsheets.batchUpdate por cantidad y tamaño. */
export function chunkRequests(reqs: SheetsRequest[], maxCount: number, maxBytes: number): SheetsRequest[][] {
  const out: SheetsRequest[][] = [];
  let cur: SheetsRequest[] = [];
  let bytes = 0;
  for (const r of reqs) {
    const b = JSON.stringify(r).length;
    if (cur.length && (cur.length >= maxCount || bytes + b > maxBytes)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(r);
    bytes += b;
  }
  if (cur.length) out.push(cur);
  return out;
}

// ------------------------------------------------------------------ creación

/** Crea un spreadsheet nuevo para el tema (solo OAuth de usuario). */
export async function createTopicSpreadsheet(api: SheetsApi, topic: Topic): Promise<{ spreadsheetId: string; url: string | null }> {
  return api.createSpreadsheet({
    title: documentTitle(topic),
    locale: SHEETS_LOCALE,
    timeZone: SHEETS_TIMEZONE,
    firstSheet: { sheetId: stableId('tab:LEEME', new Set()), title: 'LEEME' },
  });
}

// ------------------------------------------------------------------ sync

export async function syncTopic(api: SheetsApi, spreadsheetId: string, topic: Topic, source: DataSource, opts: SyncOptions = {}): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => {});
  const maxBytes = opts.maxRequestBytes ?? LIMITS.maxRequestBytes;
  const maxCount = opts.maxRequestsPerBatch ?? LIMITS.maxRequestsPerBatch;
  const calls = { batchUpdate: 0, valuesBatchUpdate: 0, valuesBatchClear: 0, valuesBatchGet: 0 };
  const warnings: string[] = [];

  const info = await api.getSpreadsheet(spreadsheetId);
  const topicMd = info.developerMetadata.find((m) => m.metadataKey === MD.topic);
  if (topicMd && topicMd.metadataValue !== topic) {
    throw new Error(
      `El documento ${spreadsheetId} está marcado como tema "${topicMd.metadataValue}", no "${topic}". Revisá SHEETS_ID_* / config/sheets.local.json.`,
    );
  }

  // ---- resolver pestañas gestionadas existentes
  const keyOf = (sh: SheetInfo) => sh.developerMetadata.find((m) => m.metadataKey === MD.tab)?.metadataValue;
  const byKey = new Map<string, SheetInfo>();
  for (const sh of info.sheets) {
    const k = keyOf(sh);
    if (k && !byKey.has(k)) byKey.set(k, sh);
  }
  const userTabCreated = info.developerMetadata.some((m) => m.metadataKey === MD.userTabCreated);

  // Plan preliminar (solo para conocer las claves de pestaña deseadas)
  const prelim = planTopic({ topic, source, now, defs: opts.defs });
  const adopted = new Map<string, SheetInfo>();
  for (const t of prelim.tabs) {
    if (t.role === 'usuario' || byKey.has(t.key)) continue;
    const sh = info.sheets.find((s) => s.title === t.title && !keyOf(s));
    if (sh) adopted.set(t.key, sh);
  }
  const resolved = new Map<string, SheetInfo>([...byKey, ...adopted]);
  const planKeys = new Set(prelim.tabs.map((t) => t.key));
  const orphanTabs = [...byKey.keys()].filter((k) => !planKeys.has(k) && k !== USER_TAB);

  // ---- leer valores actuales de las pestañas gestionadas
  const toRead = prelim.tabs.filter((t) => t.role !== 'usuario' && resolved.has(t.key));
  const existingGrids = new Map<string, Grid>();
  for (let i = 0; i < toRead.length; i += LIMITS.maxRangesPerGet) {
    const chunk = toRead.slice(i, i + LIMITS.maxRangesPerGet);
    const grids = await api.valuesBatchGet(
      spreadsheetId,
      chunk.map((t) => quoteTitle(resolved.get(t.key)!.title)),
    );
    calls.valuesBatchGet++;
    chunk.forEach((t, j) => existingGrids.set(t.key, grids[j] ?? []));
  }

  // ---- plan definitivo (respeta el orden de columnas existente)
  const dataExisting = new Map([...existingGrids].filter(([k]) => /^(DATOS|CALCULOS)_/.test(k)));
  const plan = planTopic({ topic, source, now, defs: opts.defs, existing: dataExisting, orphanTabs, runMode: opts.runMode });
  warnings.push(...plan.warnings);

  // ---- límite de celdas del libro
  {
    let cells = 0;
    const managedIds = new Set([...resolved.values()].map((s) => s.sheetId));
    for (const sh of info.sheets) if (!managedIds.has(sh.sheetId)) cells += sh.rowCount * sh.columnCount;
    for (const t of plan.tabs) {
      const sh = resolved.get(t.key);
      const rows = Math.max(t.grid.length, sh?.rowCount ?? 0);
      const cols = Math.max(gridWidth(t.grid), sh?.columnCount ?? 0);
      cells += rows * cols;
    }
    if (cells > LIMITS.maxCellsPerSpreadsheet) {
      throw new Error(`El documento superaría el límite de ${LIMITS.maxCellsPerSpreadsheet.toLocaleString('es-AR')} celdas (${cells}).`);
    }
  }

  // ---- requests estructurales
  const reqs: SheetsRequest[] = [];
  const usedIds = new Set<number>([...info.sheets.map((s) => s.sheetId), ...info.sheets.flatMap((s) => s.chartIds)]);
  if (info.locale !== SHEETS_LOCALE || info.timeZone !== SHEETS_TIMEZONE) {
    reqs.push({ updateSpreadsheetProperties: { properties: { locale: SHEETS_LOCALE, timeZone: SHEETS_TIMEZONE }, fields: 'locale,timeZone' } });
  }
  if (!topicMd) reqs.push(mdRequest({ spreadsheet: true }, MD.topic, topic));

  const finalTitle = new Map<string, string>();
  const sheetIdOf = new Map<string, number>();
  const tabsCreated: string[] = [];
  const valueBlocks: WriteBlock[] = [];
  const clears: string[] = [];
  const tabsChanged: string[] = [];
  const tabsUnchanged: string[] = [];
  const allTitles = new Set(info.sheets.map((s) => s.title));

  for (const tab of plan.tabs) {
    // EJEMPLO_GRAFICO: el gráfico se ancla en la fila 5; dejar grilla suficiente.
    const needRows = Math.max(tab.grid.length, tab.frozenRows + 1, tab.role === 'ejemplo' ? 40 : 0);
    const needCols = Math.max(gridWidth(tab.grid), tab.frozenCols + 1, 1);

    if (tab.role === 'usuario') {
      // Se crea una sola vez. Si ya existe (por metadata, flag o título), no se toca jamás.
      const exists = userTabCreated || byKey.has(USER_TAB) || allTitles.has(USER_TAB);
      if (!exists) {
        const sheetId = stableId(`tab:${tab.key}`, usedIds);
        reqs.push({
          addSheet: { properties: { sheetId, title: tab.title, gridProperties: { rowCount: 200, columnCount: 26 } } },
        });
        reqs.push(mdRequest({ sheetId }, MD.tab, tab.key));
        valueBlocks.push({ title: tab.title, row0: 0, col0: 0, values: tab.grid });
        tabsCreated.push(tab.key);
        allTitles.add(tab.title);
      }
      if (!userTabCreated) reqs.push(mdRequest({ spreadsheet: true }, MD.userTabCreated, '1'));
      continue;
    }

    const sh = resolved.get(tab.key);
    let title = tab.title;
    let grew = false;
    let isNew = false;
    if (!sh) {
      if (allTitles.has(tab.title)) {
        // Otra pestaña (con otra metadata) ocupa el nombre: no pisarla.
        warnings.push(`No se creó ${tab.title}: ya existe una pestaña con ese nombre gestionada con otra clave.`);
        continue;
      }
      const sheetId = stableId(`tab:${tab.key}`, usedIds);
      reqs.push({
        addSheet: {
          properties: {
            sheetId,
            title: tab.title,
            gridProperties: { rowCount: needRows, columnCount: needCols, frozenRowCount: tab.frozenRows, frozenColumnCount: tab.frozenCols },
          },
        },
      });
      reqs.push(mdRequest({ sheetId }, MD.tab, tab.key));
      reqs.push(...formatRequests(tab, sheetId));
      sheetIdOf.set(tab.key, sheetId);
      tabsCreated.push(tab.key);
      allTitles.add(tab.title);
      isNew = true;
    } else {
      sheetIdOf.set(tab.key, sh.sheetId);
      if (adopted.has(tab.key)) reqs.push(mdRequest({ sheetId: sh.sheetId }, MD.tab, tab.key));
      if (sh.title !== tab.title) {
        if (allTitles.has(tab.title)) {
          title = sh.title;
          warnings.push(`La pestaña gestionada ${tab.key} se llama "${sh.title}" y su nombre original está ocupado: se mantiene.`);
        } else {
          reqs.push({ updateSheetProperties: { properties: { sheetId: sh.sheetId, title: tab.title }, fields: 'title' } });
          allTitles.add(tab.title);
        }
      }
      if (sh.rowCount < needRows || sh.columnCount < needCols) {
        reqs.push({
          updateSheetProperties: {
            properties: {
              sheetId: sh.sheetId,
              gridProperties: { rowCount: Math.max(sh.rowCount, needRows), columnCount: Math.max(sh.columnCount, needCols) },
            },
            fields: 'gridProperties.rowCount,gridProperties.columnCount',
          },
        });
        grew = true;
      }
      const oldWidth = (existingGrids.get(tab.key)?.[0] ?? []).length;
      const colsChanged = (tab.role === 'datos' || tab.role === 'calculos') && oldWidth !== gridWidth(tab.grid);
      if (grew || colsChanged || adopted.has(tab.key)) reqs.push(...formatRequests(tab, sh.sheetId));
    }
    finalTitle.set(tab.key, title);

    // ---- diff de valores
    const existing = isNew ? [] : (existingGrids.get(tab.key) ?? []);
    const gRows = tab.grid.length;
    const gCols = gridWidth(tab.grid);
    const e = usedSize(existing);
    const cmpCols = tab.managedWidth === 'all' ? Math.max(gCols, e.cols) : gCols;
    const cmpRows = Math.max(gRows, e.rows);
    if (!isNew && gridsEqualWithin(tab.grid, existing, cmpRows, cmpCols)) {
      tabsUnchanged.push(tab.key);
      continue;
    }
    tabsChanged.push(tab.key);
    valueBlocks.push({ title, row0: 0, col0: 0, values: tab.grid.map((r) => [...r, ...new Array(Math.max(0, gCols - r.length)).fill(null)]) });
    if (e.rows > gRows) clears.push(a1Range(title, gRows, 0, e.rows, Math.max(cmpCols, 1)));
    if (tab.managedWidth === 'all' && e.cols > gCols && gRows > 0) clears.push(a1Range(title, 0, gCols, Math.min(gRows, e.rows), e.cols));
  }

  // ---- 1) estructura
  let structuralRequests = reqs.length;
  for (const batch of chunkRequests(reqs, maxCount, maxBytes)) {
    await api.batchUpdate(spreadsheetId, batch);
    calls.batchUpdate++;
  }

  // ---- 2) valores
  let cellsWritten = 0;
  let valueRangesWritten = 0;
  for (const batch of chunkValueWrites(valueBlocks, maxBytes)) {
    await api.valuesBatchUpdate(spreadsheetId, batch);
    calls.valuesBatchUpdate++;
    valueRangesWritten += batch.length;
    cellsWritten += batch.reduce((a, vr) => a + vr.values.length * (vr.values[0]?.length ?? 0), 0);
  }
  for (let i = 0; i < clears.length; i += 100) {
    await api.valuesBatchClear(spreadsheetId, clears.slice(i, i + 100));
    calls.valuesBatchClear++;
  }

  // ---- 3) gráfico de ejemplo (gestionado: se crea si no existe)
  let chartCreated = false;
  if (plan.chart) {
    const chartMd = info.developerMetadata.find((m) => m.metadataKey === MD.exampleChart);
    const existingChartIds = new Set(info.sheets.flatMap((s) => s.chartIds));
    const mdId = chartMd ? Number(chartMd.metadataValue) : NaN;
    const dataSheetId = sheetIdOf.get(plan.chart.dataTabKey);
    const anchorId = sheetIdOf.get(EXAMPLE_TAB);
    if (!(Number.isFinite(mdId) && existingChartIds.has(mdId)) && dataSheetId !== undefined && anchorId !== undefined) {
      const chartId = Number.isFinite(mdId) && !usedIds.has(mdId) ? mdId : stableId(`chart:${topic}`, usedIds);
      usedIds.add(chartId);
      const creqs: SheetsRequest[] = [chartRequest(plan, chartId, dataSheetId, anchorId)];
      if (!chartMd) creqs.push(mdRequest({ spreadsheet: true }, MD.exampleChart, String(chartId)));
      else if (chartMd.metadataValue !== String(chartId) && chartMd.metadataId != null) {
        creqs.push({
          updateDeveloperMetadata: {
            dataFilters: [{ developerMetadataLookup: { metadataId: chartMd.metadataId } }],
            developerMetadata: { metadataValue: String(chartId) },
            fields: 'metadataValue',
          },
        });
      }
      await api.batchUpdate(spreadsheetId, creqs);
      calls.batchUpdate++;
      structuralRequests += creqs.length;
      chartCreated = true;
    }
  }

  log(
    `[${topic}] creadas: ${tabsCreated.length}, modificadas: ${tabsChanged.length}, sin cambios: ${tabsUnchanged.length}, ` +
      `celdas escritas: ${cellsWritten}, requests estructurales: ${structuralRequests}${chartCreated ? ', gráfico de ejemplo creado' : ''}`,
  );

  return {
    spreadsheetId,
    topic,
    tabsCreated,
    tabsAdopted: [...adopted.keys()],
    tabsChanged,
    tabsUnchanged,
    orphanTabs,
    structuralRequests,
    valueRangesWritten,
    cellsWritten,
    rangesCleared: clears.length,
    chartCreated,
    apiCalls: calls,
    warnings,
    plan,
  };
}
