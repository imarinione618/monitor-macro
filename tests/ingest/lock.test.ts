import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { acquireLock, readLock } from '../../src/ingest/lock';
import { tmpDir } from './helpers';

describe('lock de ejecución', () => {
  it('impide una segunda corrida simultánea y se libera', () => {
    const file = path.join(tmpDir(), '.lock');
    const release = acquireLock(file, { runId: 'a' });
    expect(readLock(file)?.runId).toBe('a');
    expect(() => acquireLock(file, { runId: 'b' })).toThrow(/otra ingesta en curso/);
    release();
    expect(fs.existsSync(file)).toBe(false);
    const r2 = acquireLock(file, { runId: 'b' });
    r2();
  });

  it('reemplaza un lock vencido por antigüedad', () => {
    const file = path.join(tmpDir(), '.lock');
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, hostname: os.hostname(), startedAt: '2020-01-01T00:00:00Z', runId: 'viejo' }));
    const release = acquireLock(file, { runId: 'nuevo' });
    expect(readLock(file)?.runId).toBe('nuevo');
    release();
  });

  it('reemplaza un lock de un proceso que ya no existe en esta máquina', () => {
    const file = path.join(tmpDir(), '.lock');
    fs.writeFileSync(file, JSON.stringify({ pid: 999999, hostname: os.hostname(), startedAt: new Date().toISOString(), runId: 'muerto' }));
    const release = acquireLock(file, { runId: 'nuevo' });
    expect(readLock(file)?.runId).toBe('nuevo');
    release();
  });

  it('un lock ilegible se considera vencido; la liberación no borra locks ajenos', () => {
    const file = path.join(tmpDir(), '.lock');
    fs.writeFileSync(file, 'basura');
    const release = acquireLock(file, { runId: 'x' });
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, hostname: os.hostname(), startedAt: new Date().toISOString(), runId: 'otro' }));
    release();
    expect(readLock(file)?.runId).toBe('otro');
  });
});
