/**
 * Configuración de la ingesta desde variables de entorno (.env vía dotenv).
 * El token se lee acá y se pasa solo al cliente HTTP; no se loguea nunca.
 */
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { API_BASE_URL_DEFAULT } from '../core/datasets';
import { IngestError } from './errors';

let loaded = false;
export function loadEnv(): void {
  if (loaded) return;
  loadDotenv({ quiet: true });
  loaded = true;
}

function num(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new IngestError('config', `Variable ${name} inválida: debe ser un número ≥ 0`);
  return n;
}

export interface IngestEnv {
  token: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  minIntervalMs: number;
  cacheTtlHours: number;
  cacheDir: string;
}

export function readIngestEnv(): IngestEnv {
  loadEnv();
  const token = (process.env.INDEC_API_TOKEN ?? '').trim();
  if (!token) {
    throw new IngestError(
      'config',
      'Falta INDEC_API_TOKEN en .env (generarlo en https://api.indec.gob.ar/ → perfil → generar token).',
    );
  }
  return {
    token,
    baseUrl: (process.env.INDEC_API_BASE_URL ?? '').trim() || API_BASE_URL_DEFAULT,
    timeoutMs: num('INDEC_TIMEOUT_MS', 30000),
    maxRetries: num('INDEC_MAX_RETRIES', 4),
    minIntervalMs: num('INDEC_MIN_INTERVAL_MS', 250),
    cacheTtlHours: num('INDEC_CACHE_TTL_HOURS', 6),
    cacheDir: path.resolve('data/cache'),
  };
}
