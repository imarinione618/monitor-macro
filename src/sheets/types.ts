/**
 * Tipos y constantes del conector de Google Sheets.
 *
 * `SheetsApi` es la superficie mínima de la API que usa el writer. Hay dos
 * implementaciones:
 *  - `client.ts`  → API real (googleapis) con reintentos/backoff.
 *  - `memory.ts`  → simulación en memoria (tests y `--dry-run`).
 */
import type { sheets_v4 } from 'googleapis';

/** Valor de celda tal como se escribe/lee con valueInputOption=RAW / UNFORMATTED_VALUE. */
export type CellValue = string | number | boolean | null;
/** Grilla por filas: grid[fila][columna]. Puede ser irregular (filas más cortas = vacías a la derecha). */
export type Grid = CellValue[][];

export type SheetsRequest = sheets_v4.Schema$Request;
export type SheetsResponse = sheets_v4.Schema$Response;

export interface DeveloperMetadataInfo {
  metadataId?: number | null;
  metadataKey: string;
  metadataValue: string;
}

export interface SheetInfo {
  sheetId: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
  frozenRowCount: number;
  frozenColumnCount: number;
  developerMetadata: DeveloperMetadataInfo[];
  chartIds: number[];
}

export interface SpreadsheetInfo {
  spreadsheetId: string;
  title: string;
  locale: string | null;
  timeZone: string | null;
  url?: string | null;
  developerMetadata: DeveloperMetadataInfo[];
  sheets: SheetInfo[];
}

export interface ValueRangeWrite {
  /** Rango A1 (con nombre de pestaña entre comillas simples). */
  range: string;
  values: CellValue[][];
}

/** Superficie mínima de la API de Sheets usada por el writer. */
export interface SheetsApi {
  createSpreadsheet(input: { title: string; locale: string; timeZone: string; firstSheet: { sheetId: number; title: string } }): Promise<{
    spreadsheetId: string;
    url: string | null;
  }>;
  getSpreadsheet(spreadsheetId: string): Promise<SpreadsheetInfo>;
  batchUpdate(spreadsheetId: string, requests: SheetsRequest[]): Promise<SheetsResponse[]>;
  /** Lee rangos con UNFORMATTED_VALUE + SERIAL_NUMBER (fechas como número). */
  valuesBatchGet(spreadsheetId: string, ranges: string[]): Promise<Grid[]>;
  /** Escribe con valueInputOption=RAW (sin interpretar fórmulas ni fechas en texto). */
  valuesBatchUpdate(spreadsheetId: string, data: ValueRangeWrite[]): Promise<void>;
  valuesBatchClear(spreadsheetId: string, ranges: string[]): Promise<void>;
  /** Opcional (solo OAuth con drive.file): true si el archivo está en la papelera. */
  isTrashed?(spreadsheetId: string): Promise<boolean | null>;
}

// ------------------------------------------------------------------ constantes

export const SHEETS_LOCALE = 'es_AR';
export const SHEETS_TIMEZONE = 'America/Argentina/Buenos_Aires';

/**
 * Claves de developer metadata (visibilidad DOCUMENT, para que las vea cualquier
 * credencial: OAuth del usuario o cuenta de servicio).
 */
export const MD = {
  /** Spreadsheet: tema del documento ("actividad", ...). Evita escribir un tema en el documento de otro. */
  topic: 'indec_monitor_topic',
  /** Pestaña: clave estable de pestaña gestionada (p.ej. "DATOS_EMAE_M"). */
  tab: 'indec_monitor_tab',
  /** Spreadsheet: chartId del gráfico de ejemplo gestionado. */
  exampleChart: 'indec_monitor_example_chart',
  /** Spreadsheet: "1" cuando GRAFICOS_USUARIO ya fue creada (no se vuelve a crear ni se toca). */
  userTabCreated: 'indec_monitor_user_tab_created',
} as const;

/** Límites prácticos de la API (ver docs/google-sheets.md). */
export const LIMITS = {
  /** Celdas por libro (límite de Google Sheets). */
  maxCellsPerSpreadsheet: 10_000_000,
  /** Tamaño objetivo por request (el límite duro es ~10 MB; dejamos margen). */
  maxRequestBytes: 2_000_000,
  /** Máximo de requests por llamada a spreadsheets.batchUpdate. */
  maxRequestsPerBatch: 500,
  /** Rangos por llamada a values.batchGet (los rangos van en la URL). */
  maxRangesPerGet: 25,
} as const;
