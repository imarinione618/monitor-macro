import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requiredDatasets } from '../../src/core/registry';
import { getSourceFreshness } from '../../src/web/server/freshness';
import { formatShortDateTimeAR } from '../../src/web/lib/format';

const ENV = ['STORE_DIR', 'MONETARY_STORE_DIR', 'COMBUSTIBLES_STORE_DIR'] as const;
let saved: Record<string, string | undefined> = {};
let root = '';

function write(dir: string, data: unknown) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(data));
}

const OLD = '2026-11-09T15:00:00.000Z';
const NEW = '2026-11-11T15:00:00.000Z';

beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-fresh-'));
  for (const [k, sub] of [['STORE_DIR', 'store'], ['MONETARY_STORE_DIR', 'monetary'], ['COMBUSTIBLES_STORE_DIR', 'fuel']] as const) {
    process.env[k] = path.join(root, sub);
  }
});
afterEach(() => {
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  fs.rmSync(root, { recursive: true, force: true });
});

describe('frescura por fuente', () => {
  it('INDEC caído no afecta a BCRA/A3/combustibles; fecha = última consulta exitosa', () => {
    const datasets = Object.fromEntries(requiredDatasets().map((id) => [id, { dataset: id, lastSuccessAt: OLD, lastAttemptAt: NEW, lastRunId: 'r', ok: false }]));
    write(path.join(root, 'store'), { schemaVersion: 1, dataMode: 'real', generatedAt: NEW, lastRun: null, datasets, feeds: {}, series: {} });
    write(path.join(root, 'monetary'), {
      schemaVersion: 1, updatedAt: NEW, lastAttemptAt: NEW, lastFullAt: null,
      series: {
        'monetario.bcra.7': { count: 1, firstDate: null, lastDate: null, retrievedAt: NEW, stale: false },
        'monetario.a3.caucion': { count: 1, firstDate: null, lastDate: null, retrievedAt: OLD, stale: true },
      },
    });
    write(path.join(root, 'fuel'), {
      schemaVersion: 1, updatedAt: NEW, lastAttemptAt: NEW,
      series: {
        'combustibles.diaria': { count: 1, retrievedAt: NEW, stale: false },
        'combustibles.mensual': { count: 1, retrievedAt: OLD, stale: false }, // se baja cada 7 días a propósito
      },
    });

    const by = Object.fromEntries(getSourceFreshness().map((f) => [f.key, f]));
    expect(by.indec).toMatchObject({ ok: false, updatedAt: OLD });
    expect(by.indec!.failed).toHaveLength(requiredDatasets().length);
    expect(by.bcra).toMatchObject({ ok: true, updatedAt: NEW });
    expect(by.a3).toMatchObject({ ok: false, updatedAt: OLD, failed: ['monetario.a3.caucion'] });
    expect(by.energia).toMatchObject({ ok: true, updatedAt: NEW });
  });

  it('solo cuenta feeds usados por el registro y omite fuentes sin manifest', () => {
    write(path.join(root, 'store'), { schemaVersion: 1, dataMode: 'real', generatedAt: NEW, lastRun: null, datasets: {}, feeds: {}, series: {} });
    const keys = getSourceFreshness().map((f) => f.key);
    expect(keys).not.toContain('bcra');
    expect(keys).not.toContain('energia');
    const gob = getSourceFreshness().find((f) => f.key === 'datosgob');
    expect(gob?.failed).not.toContain('sspm.aif');
  });

  it('formato corto sin año, en hora de Buenos Aires', () => {
    expect(formatShortDateTimeAR(NEW)).toBe('11/11 12:00');
    expect(formatShortDateTimeAR(null)).toBe('s/d');
  });
});
