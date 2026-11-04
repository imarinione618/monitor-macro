/**
 * IDs de los 4 documentos. Prioridad:
 *   1) variables de entorno SHEETS_ID_ACTIVIDAD / _LABORAL / _PRECIOS / _COMEX
 *   2) config/sheets.local.json (gitignored; lo escribe sheets:sync al crear documentos con OAuth)
 * Plantilla: config/sheets.example.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from '../core/store';
import type { Topic } from '../core/types';

export const TOPICS: Topic[] = ['actividad', 'laboral', 'precios', 'comex'];

export interface SheetsDocEntry {
  spreadsheetId: string;
  url?: string | null;
  title?: string;
  createdAt?: string;
}

export type SheetsLocalConfig = Partial<Record<Topic, SheetsDocEntry>>;

export function localConfigPath(): string {
  return path.resolve(process.env.SHEETS_CONFIG_PATH?.trim() || 'config/sheets.local.json');
}

export function readLocalConfig(file = localConfigPath()): SheetsLocalConfig {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as SheetsLocalConfig;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`No se pudo leer ${file}: ${(e as Error).message}`);
  }
}

export function saveLocalConfigEntry(topic: Topic, entry: SheetsDocEntry, file = localConfigPath()): void {
  const cfg = readLocalConfig(file);
  cfg[topic] = entry;
  writeJsonAtomic(file, cfg);
}

export function envKey(topic: Topic): string {
  return `SHEETS_ID_${topic.toUpperCase()}`;
}

/** Acepta un ID o una URL de Google Sheets. */
export function normalizeSpreadsheetId(v: string): string {
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(v);
  return (m ? m[1]! : v).trim();
}

export function resolveSpreadsheetId(topic: Topic, env: Record<string, string | undefined> = process.env, file = localConfigPath()): { id: string; from: 'env' | 'config' } | null {
  const e = (env[envKey(topic)] ?? '').trim();
  if (e) return { id: normalizeSpreadsheetId(e), from: 'env' };
  const c = readLocalConfig(file)[topic]?.spreadsheetId?.trim();
  return c ? { id: normalizeSpreadsheetId(c), from: 'config' } : null;
}
