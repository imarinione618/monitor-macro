/**
 * Vista previa local (--dry-run): corre el writer REAL contra la simulación en
 * memoria de un documento vacío y vuelca:
 *   data/sheets-preview/<topic>/<PESTAÑA>.csv   valores exactos que se escribirían
 *                                               (fechas como serial numérico de Sheets)
 *   data/sheets-preview/<topic>/requests.json   plan de llamadas (batchUpdate, values.batchUpdate, ...)
 * No toca Google.
 */
import fs from 'node:fs';
import path from 'node:path';
import { InMemorySheetsApi } from './memory';
import type { DataSource } from './source';
import type { CellValue } from './types';
import { createTopicSpreadsheet, syncTopic, type SyncResult } from './writer';
import type { SeriesDef, Topic } from '../core/types';

export function toCsv(rows: CellValue[][]): string {
  const esc = (v: CellValue): string => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? String(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

export interface PreviewResult {
  dir: string;
  files: string[];
  result: SyncResult;
}

export async function previewTopic(
  topic: Topic,
  source: DataSource,
  opts: { outDir: string; now?: Date; defs?: SeriesDef[]; maxRequestBytes?: number },
): Promise<PreviewResult> {
  const api = new InMemorySheetsApi();
  const { spreadsheetId } = await createTopicSpreadsheet(api, topic);
  const result = await syncTopic(api, spreadsheetId, topic, source, {
    now: opts.now,
    defs: opts.defs,
    maxRequestBytes: opts.maxRequestBytes,
    runMode: 'dry-run (vista previa local, sin Google)',
  });

  const dir = path.join(opts.outDir, topic);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.csv') || f === 'requests.json') fs.rmSync(path.join(dir, f));

  const doc = api.doc(spreadsheetId);
  const files: string[] = [];
  for (const s of doc.sheets.slice().sort((a, b) => a.index - b.index)) {
    const file = path.join(dir, `${s.title}.csv`);
    fs.writeFileSync(file, toCsv(api.values(spreadsheetId, s.title)), 'utf8');
    files.push(file);
  }
  const reqFile = path.join(dir, 'requests.json');
  fs.writeFileSync(
    reqFile,
    JSON.stringify(
      {
        topic,
        title: result.plan.title,
        generatedAt: (opts.now ?? new Date()).toISOString(),
        note:
          'Vista previa de una PRIMERA sincronización contra un documento vacío. Sobre un documento existente, ' +
          'el writer solo envía los cambios (pestañas cuyo contenido difiere, expansión de grilla, gráfico faltante).',
        synthetic: result.plan.synthetic,
        staleSeries: result.plan.staleSeries,
        warnings: result.warnings,
        summary: {
          tabsCreated: result.tabsCreated,
          structuralRequests: result.structuralRequests,
          valueRangesWritten: result.valueRangesWritten,
          cellsWritten: result.cellsWritten,
          apiCalls: result.apiCalls,
          chartCreated: result.chartCreated,
        },
        sheets: doc.sheets.map((s) => ({
          sheetId: s.sheetId,
          title: s.title,
          rowCount: s.rowCount,
          columnCount: s.columnCount,
          frozenRowCount: s.frozenRowCount,
          frozenColumnCount: s.frozenColumnCount,
          developerMetadata: s.developerMetadata,
        })),
        spreadsheetDeveloperMetadata: doc.developerMetadata,
        charts: doc.charts,
        calls: api.calls.filter((c) => c.method !== 'getSpreadsheet' && c.method !== 'valuesBatchGet'),
      },
      null,
      1,
    ),
    'utf8',
  );
  files.push(reqFile);
  return { dir, files, result };
}
