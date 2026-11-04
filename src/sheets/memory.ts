/**
 * Simulación EN MEMORIA de la API de Google Sheets (subconjunto usado por el writer).
 *
 * Se usa en los tests y en `--dry-run` (el writer real corre contra esta simulación
 * y lo registrado es exactamente lo que se enviaría a Google). Reproduce las reglas
 * que importan para la idempotencia: sheetId/chartId únicos, títulos únicos,
 * developer metadata, error si se escribe fuera de la grilla ("exceeds grid limits"),
 * batchUpdate atómico, lecturas con filas/columnas vacías finales recortadas.
 */
import { parseA1, usedSize } from './a1';
import type {
  CellValue,
  DeveloperMetadataInfo,
  Grid,
  SheetInfo,
  SheetsApi,
  SheetsRequest,
  SheetsResponse,
  SpreadsheetInfo,
  ValueRangeWrite,
} from './types';

export interface MemChart {
  chartId: number;
  anchorSheetId: number;
  spec: unknown;
}

export interface MemSheet {
  sheetId: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
  frozenRowCount: number;
  frozenColumnCount: number;
  developerMetadata: DeveloperMetadataInfo[];
  values: Grid;
  /** Formatos aplicados (repeatCell / updateDimensionProperties), para inspección. */
  formats: SheetsRequest[];
  /** Notas de celda simuladas (las pone el usuario; el writer no las toca). */
  notes: Map<string, string>;
}

export interface MemSpreadsheet {
  spreadsheetId: string;
  title: string;
  locale: string | null;
  timeZone: string | null;
  developerMetadata: DeveloperMetadataInfo[];
  sheets: MemSheet[];
  charts: MemChart[];
}

export interface MemCall {
  method: 'createSpreadsheet' | 'getSpreadsheet' | 'batchUpdate' | 'valuesBatchGet' | 'valuesBatchUpdate' | 'valuesBatchClear';
  spreadsheetId?: string;
  body?: unknown;
}

const clone = <T>(x: T): T => structuredClone(x);

export class InMemorySheetsApi implements SheetsApi {
  readonly docs = new Map<string, MemSpreadsheet>();
  readonly calls: MemCall[] = [];
  private nextDoc = 1;
  private nextMd = 1;

  // ------------------------------------------------------------ SheetsApi

  async createSpreadsheet(input: { title: string; locale: string; timeZone: string; firstSheet: { sheetId: number; title: string } }) {
    const spreadsheetId = `mem-${this.nextDoc++}`;
    this.calls.push({
      method: 'createSpreadsheet',
      body: { properties: { title: input.title, locale: input.locale, timeZone: input.timeZone }, sheets: [{ properties: input.firstSheet }] },
    });
    this.docs.set(spreadsheetId, {
      spreadsheetId,
      title: input.title,
      locale: input.locale,
      timeZone: input.timeZone,
      developerMetadata: [],
      sheets: [this.newSheet(input.firstSheet.sheetId, input.firstSheet.title, 0, 1000, 26)],
      charts: [],
    });
    return { spreadsheetId, url: `memory://${spreadsheetId}` };
  }

  async getSpreadsheet(spreadsheetId: string): Promise<SpreadsheetInfo> {
    this.calls.push({ method: 'getSpreadsheet', spreadsheetId });
    const d = this.doc(spreadsheetId);
    return {
      spreadsheetId,
      title: d.title,
      locale: d.locale,
      timeZone: d.timeZone,
      url: `memory://${spreadsheetId}`,
      developerMetadata: clone(d.developerMetadata),
      sheets: d.sheets
        .slice()
        .sort((a, b) => a.index - b.index)
        .map(
          (s): SheetInfo => ({
            sheetId: s.sheetId,
            title: s.title,
            index: s.index,
            rowCount: s.rowCount,
            columnCount: s.columnCount,
            frozenRowCount: s.frozenRowCount,
            frozenColumnCount: s.frozenColumnCount,
            developerMetadata: clone(s.developerMetadata),
            chartIds: d.charts.filter((c) => c.anchorSheetId === s.sheetId).map((c) => c.chartId),
          }),
        ),
    };
  }

  async batchUpdate(spreadsheetId: string, requests: SheetsRequest[]): Promise<SheetsResponse[]> {
    this.calls.push({ method: 'batchUpdate', spreadsheetId, body: { requests: clone(requests) } });
    const original = this.doc(spreadsheetId);
    const d = clone(original); // atómico: si algo falla no se aplica nada
    const replies: SheetsResponse[] = [];
    for (const r of requests) replies.push(this.apply(d, r));
    this.docs.set(spreadsheetId, d);
    return replies;
  }

  async valuesBatchGet(spreadsheetId: string, ranges: string[]): Promise<Grid[]> {
    this.calls.push({ method: 'valuesBatchGet', spreadsheetId, body: { ranges, valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' } });
    const d = this.doc(spreadsheetId);
    return ranges.map((range) => {
      const a = parseA1(range);
      const s = this.sheetByTitle(d, a.title);
      const { rows, cols } = usedSize(s.values);
      const r0 = a.row0 ?? 0;
      const c0 = a.col0 ?? 0;
      const r1 = Math.min(a.rowEnd ?? rows, rows);
      const c1 = Math.min(a.colEnd ?? cols, cols);
      const out: Grid = [];
      for (let r = r0; r < r1; r++) {
        const row = (s.values[r] ?? []).slice(c0, c1).map((v) => (v === undefined ? null : v));
        while (row.length && (row.at(-1) === null || row.at(-1) === '')) row.pop();
        out.push(row.map((v) => (v === null ? '' : v)));
      }
      while (out.length && out.at(-1)!.length === 0) out.pop();
      return out;
    });
  }

  async valuesBatchUpdate(spreadsheetId: string, data: ValueRangeWrite[]): Promise<void> {
    this.calls.push({ method: 'valuesBatchUpdate', spreadsheetId, body: { valueInputOption: 'RAW', data: clone(data) } });
    const d = clone(this.doc(spreadsheetId));
    for (const vr of data) {
      const a = parseA1(vr.range);
      const s = this.sheetByTitle(d, a.title);
      const r0 = a.row0 ?? 0;
      const c0 = a.col0 ?? 0;
      const height = vr.values.length;
      const width = vr.values.reduce((w, r) => Math.max(w, r.length), 0);
      if (a.rowEnd !== null && r0 + height > a.rowEnd) throw new Error(`Datos exceden el rango ${vr.range}`);
      if (a.colEnd !== null && c0 + width > a.colEnd) throw new Error(`Datos exceden el rango ${vr.range}`);
      if (r0 + height > s.rowCount || c0 + width > s.columnCount) {
        throw new Error(`Range (${vr.range}) exceeds grid limits. Max rows: ${s.rowCount}, max columns: ${s.columnCount}`);
      }
      vr.values.forEach((row, i) => {
        const target = (s.values[r0 + i] ??= []);
        row.forEach((v, j) => {
          if (v === null || v === undefined) return; // null = no tocar (semántica de la API)
          if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('Número no finito');
          target[c0 + j] = v === '' ? null : v;
        });
      });
      fillHoles(s.values);
    }
    this.docs.set(spreadsheetId, d);
  }

  async valuesBatchClear(spreadsheetId: string, ranges: string[]): Promise<void> {
    this.calls.push({ method: 'valuesBatchClear', spreadsheetId, body: { ranges } });
    const d = this.doc(spreadsheetId);
    for (const range of ranges) {
      const a = parseA1(range);
      const s = this.sheetByTitle(d, a.title);
      const r1 = a.rowEnd ?? s.rowCount;
      const c1 = a.colEnd ?? s.columnCount;
      for (let r = a.row0 ?? 0; r < Math.min(r1, s.values.length); r++) {
        const row = s.values[r];
        if (!row) continue;
        for (let c = a.col0 ?? 0; c < Math.min(c1, row.length); c++) row[c] = null;
      }
    }
  }

  // ------------------------------------------------------------ helpers de simulación (tests)

  doc(id: string): MemSpreadsheet {
    const d = this.docs.get(id);
    if (!d) throw new Error(`Requested entity was not found (spreadsheet ${id})`);
    return d;
  }

  sheet(id: string, title: string): MemSheet {
    return this.sheetByTitle(this.doc(id), title);
  }

  /** Valores tal como los vería la API (recortados). */
  values(id: string, title: string): Grid {
    const s = this.sheet(id, title);
    const { rows, cols } = usedSize(s.values);
    return s.values.slice(0, rows).map((r) => Array.from({ length: cols }, (_, j) => r[j] ?? null));
  }

  /** Simula una acción manual del usuario: crea una pestaña con valores. */
  userAddSheet(id: string, title: string, values: Grid = []): number {
    const d = this.doc(id);
    const sheetId = Math.max(0, ...d.sheets.map((s) => s.sheetId), ...d.charts.map((c) => c.chartId)) + 1;
    const s = this.newSheet(sheetId, title, d.sheets.length, 1000, 26);
    s.values = clone(values);
    d.sheets.push(s);
    return sheetId;
  }

  /** Simula un gráfico creado por el usuario en una pestaña. */
  userAddChart(id: string, sheetTitle: string, spec: unknown = { title: 'gráfico del usuario' }): number {
    const d = this.doc(id);
    const s = this.sheetByTitle(d, sheetTitle);
    const chartId = Math.max(0, ...d.sheets.map((x) => x.sheetId), ...d.charts.map((c) => c.chartId)) + 7;
    d.charts.push({ chartId, anchorSheetId: s.sheetId, spec });
    return chartId;
  }

  writeCount(): number {
    return this.calls.filter((c) => c.method === 'batchUpdate' || c.method === 'valuesBatchUpdate' || c.method === 'valuesBatchClear').length;
  }

  // ------------------------------------------------------------ internos

  private newSheet(sheetId: number, title: string, index: number, rowCount: number, columnCount: number): MemSheet {
    return {
      sheetId,
      title,
      index,
      rowCount,
      columnCount,
      frozenRowCount: 0,
      frozenColumnCount: 0,
      developerMetadata: [],
      values: [],
      formats: [],
      notes: new Map(),
    };
  }

  private sheetByTitle(d: MemSpreadsheet, title: string): MemSheet {
    const s = d.sheets.find((x) => x.title === title);
    if (!s) throw new Error(`Unable to parse range: ${title}`);
    return s;
  }

  private sheetById(d: MemSpreadsheet, sheetId: number | null | undefined): MemSheet {
    const s = d.sheets.find((x) => x.sheetId === sheetId);
    if (!s) throw new Error(`No grid with id: ${sheetId}`);
    return s;
  }

  private checkRange(d: MemSpreadsheet, g: { sheetId?: number | null; startRowIndex?: number | null; endRowIndex?: number | null; startColumnIndex?: number | null; endColumnIndex?: number | null }) {
    const s = this.sheetById(d, g.sheetId ?? 0);
    if ((g.endRowIndex ?? 0) > s.rowCount || (g.endColumnIndex ?? 0) > s.columnCount) {
      throw new Error(`Range exceeds grid limits (sheet ${s.title})`);
    }
    return s;
  }

  private apply(d: MemSpreadsheet, r: SheetsRequest): SheetsResponse {
    const ids = new Set([...d.sheets.map((s) => s.sheetId), ...d.charts.map((c) => c.chartId)]);
    if (r.addSheet) {
      const p = r.addSheet.properties ?? {};
      const sheetId = p.sheetId ?? Math.max(0, ...ids) + 1;
      if (ids.has(sheetId)) throw new Error(`Invalid requests[0].addSheet: ID ${sheetId} already exists`);
      if (!p.title || d.sheets.some((s) => s.title === p.title)) throw new Error(`A sheet with the name "${p.title}" already exists.`);
      const gp = p.gridProperties ?? {};
      const s = this.newSheet(sheetId, p.title, p.index ?? d.sheets.length, gp.rowCount ?? 1000, gp.columnCount ?? 26);
      s.frozenRowCount = gp.frozenRowCount ?? 0;
      s.frozenColumnCount = gp.frozenColumnCount ?? 0;
      if (s.frozenRowCount >= s.rowCount) throw new Error('You cannot freeze all visible rows');
      d.sheets.push(s);
      return { addSheet: { properties: { sheetId, title: p.title } } };
    }
    if (r.updateSheetProperties) {
      const p = r.updateSheetProperties.properties ?? {};
      const s = this.sheetById(d, p.sheetId);
      const fields = (r.updateSheetProperties.fields ?? '').split(',').map((f) => f.trim());
      for (const f of fields) {
        if (f === 'title') {
          if (d.sheets.some((x) => x.title === p.title && x !== s)) throw new Error(`A sheet with the name "${p.title}" already exists.`);
          s.title = p.title!;
        } else if (f === 'gridProperties.rowCount') s.rowCount = p.gridProperties!.rowCount!;
        else if (f === 'gridProperties.columnCount') s.columnCount = p.gridProperties!.columnCount!;
        else if (f === 'gridProperties.frozenRowCount') s.frozenRowCount = p.gridProperties!.frozenRowCount!;
        else if (f === 'gridProperties.frozenColumnCount') s.frozenColumnCount = p.gridProperties!.frozenColumnCount!;
        else throw new Error(`Campo no soportado en la simulación: ${f}`);
      }
      return {};
    }
    if (r.createDeveloperMetadata) {
      const m = r.createDeveloperMetadata.developerMetadata!;
      const md: DeveloperMetadataInfo = { metadataId: this.nextMd++, metadataKey: m.metadataKey!, metadataValue: m.metadataValue ?? '' };
      if (m.location?.spreadsheet) d.developerMetadata.push(md);
      else this.sheetById(d, m.location?.sheetId).developerMetadata.push(md);
      return { createDeveloperMetadata: { developerMetadata: { ...md } } };
    }
    if (r.updateDeveloperMetadata) {
      const id = r.updateDeveloperMetadata.dataFilters?.[0]?.developerMetadataLookup?.metadataId;
      const all = [...d.developerMetadata, ...d.sheets.flatMap((s) => s.developerMetadata)];
      const md = all.find((m) => m.metadataId === id);
      if (!md) throw new Error(`Metadata ${id} no encontrada`);
      md.metadataValue = r.updateDeveloperMetadata.developerMetadata?.metadataValue ?? md.metadataValue;
      return {};
    }
    if (r.addChart) {
      const c = r.addChart.chart!;
      const chartId = c.chartId ?? Math.max(0, ...ids) + 1;
      if (ids.has(chartId)) throw new Error(`Invalid requests[0].addChart: ID ${chartId} already exists`);
      const cell = c.position?.overlayPosition?.anchorCell;
      const anchor = cell?.sheetId;
      const anchorSheet = this.sheetById(d, anchor);
      if ((cell?.rowIndex ?? 0) >= anchorSheet.rowCount || (cell?.columnIndex ?? 0) >= anchorSheet.columnCount) {
        throw new Error('Invalid addChart: anchor cell exceeds grid limits');
      }
      const spec = c.spec?.basicChart;
      for (const dom of spec?.domains ?? []) for (const src of dom.domain?.sourceRange?.sources ?? []) this.checkRange(d, src);
      for (const ser of spec?.series ?? []) for (const src of ser.series?.sourceRange?.sources ?? []) this.checkRange(d, src);
      d.charts.push({ chartId, anchorSheetId: anchor!, spec: clone(c.spec) });
      return { addChart: { chart: { chartId } } };
    }
    if (r.repeatCell) {
      const s = this.checkRange(d, r.repeatCell.range ?? {});
      s.formats.push(clone(r));
      return {};
    }
    if (r.updateDimensionProperties) {
      const rg = r.updateDimensionProperties.range!;
      const s = this.sheetById(d, rg.sheetId);
      const max = rg.dimension === 'ROWS' ? s.rowCount : s.columnCount;
      if ((rg.endIndex ?? 0) > max) throw new Error('Range exceeds grid limits');
      s.formats.push(clone(r));
      return {};
    }
    if (r.updateSpreadsheetProperties) {
      const p = r.updateSpreadsheetProperties.properties ?? {};
      if (p.locale) d.locale = p.locale;
      if (p.timeZone) d.timeZone = p.timeZone;
      if (p.title) d.title = p.title;
      return {};
    }
    if (r.deleteEmbeddedObject) {
      d.charts = d.charts.filter((c) => c.chartId !== r.deleteEmbeddedObject!.objectId);
      return {};
    }
    throw new Error(`Request no soportada por la simulación: ${Object.keys(r).join(',')}`);
  }
}

function fillHoles(g: Grid): void {
  for (let i = 0; i < g.length; i++) {
    if (!g[i]) g[i] = [];
    const row = g[i]!;
    for (let j = 0; j < row.length; j++) if (row[j] === undefined) row[j] = null as CellValue;
  }
}
