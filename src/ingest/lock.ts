/**
 * Lock de ejecución (data/.lock) para evitar dos ingestas simultáneas.
 * Creación atómica con O_EXCL. Un lock se considera vencido si supera `staleMs`
 * o si el proceso que lo tomó ya no existe en esta misma máquina.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IngestError } from './errors';

export interface LockInfo {
  pid: number;
  hostname: string;
  startedAt: string;
  runId: string;
}

export const DEFAULT_LOCK_STALE_MS = 3 * 3600_000;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function readLock(file: string): LockInfo | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as LockInfo;
  } catch {
    return null;
  }
}

export function isLockStale(info: LockInfo | null, now: number, staleMs: number): boolean {
  if (!info || !info.startedAt) return true; // archivo corrupto o vacío
  const age = now - Date.parse(info.startedAt);
  if (!(age >= 0) || age > staleMs) return true;
  if (info.hostname === os.hostname() && info.pid !== process.pid && !pidAlive(info.pid)) return true;
  return false;
}

/**
 * Toma el lock o lanza IngestError('config') si hay otra corrida activa.
 * Devuelve la función que lo libera (solo borra el lock si sigue siendo propio).
 */
export function acquireLock(
  file: string,
  opts: { runId: string; staleMs?: number; now?: () => number; log?: (m: string) => void } ,
): () => void {
  const now = opts.now ?? Date.now;
  const staleMs = opts.staleMs ?? DEFAULT_LOCK_STALE_MS;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const info: LockInfo = { pid: process.pid, hostname: os.hostname(), startedAt: new Date(now()).toISOString(), runId: opts.runId };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, JSON.stringify(info));
      fs.closeSync(fd);
      return () => {
        const cur = readLock(file);
        if (cur && cur.runId === info.runId) {
          try {
            fs.unlinkSync(file);
          } catch {
            /* ya no existe */
          }
        }
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const other = readLock(file);
      if (attempt === 0 && isLockStale(other, now(), staleMs)) {
        opts.log?.(`Lock vencido encontrado (${other ? `pid ${other.pid}, desde ${other.startedAt}` : 'ilegible'}); se reemplaza.`);
        try {
          fs.unlinkSync(file);
        } catch {
          /* otro proceso lo borró */
        }
        continue;
      }
      throw new IngestError(
        'config',
        `Hay otra ingesta en curso (${other ? `pid ${other.pid} en ${other.hostname}, desde ${other.startedAt}` : 'lock ilegible'}). ` +
          `Si no es así, borrar ${file}.`,
      );
    }
  }
  throw new IngestError('config', `No se pudo tomar el lock ${file}`);
}
