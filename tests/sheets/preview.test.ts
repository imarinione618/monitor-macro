import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { previewTopic } from '../../src/sheets/preview';
import { loadStoreSource } from '../../src/sheets/source';
import { periodToSheetsSerial } from '../../src/core/periods';
import { fixtureStoreDir, NOW, tmpDir } from './helpers';

describe('--dry-run contra el store sintético', () => {
  it('genera un CSV por pestaña y requests.json, marcando datos sintéticos', async () => {
    const out = tmpDir('indec-preview-');
    const src = loadStoreSource(fixtureStoreDir());
    const { dir, files, result } = await previewTopic('actividad', src, { outDir: out, now: NOW });
    expect(dir).toBe(path.join(out, 'actividad'));
    const names = files.map((f) => path.basename(f));
    expect(names).toEqual(expect.arrayContaining(['LEEME.csv', 'CATALOGO.csv', 'CONTROL.csv', 'DATOS_EMAE_M.csv', 'CALCULOS_EMAE_M.csv', 'EJEMPLO_GRAFICO.csv', 'GRAFICOS_USUARIO.csv', 'requests.json']));
    const datos = fs.readFileSync(path.join(dir, 'DATOS_EMAE_M.csv'), 'utf8').replace(/^﻿/, '').split('\r\n');
    expect(datos[0]!.split(',')[0]).toBe('fecha');
    expect(datos[0]).toContain('actividad.emae.total.sa|level');
    expect(datos[2]!.split(',')[0]).toBe(String(periodToSheetsSerial(src.getData('actividad.emae.total.sa')!.meta.firstPeriod!)));
    const control = fs.readFileSync(path.join(dir, 'CONTROL.csv'), 'utf8');
    expect(control).toContain('SINTÉTICO');
    expect(fs.readFileSync(path.join(dir, 'LEEME.csv'), 'utf8')).toContain('DATOS SINTÉTICOS');
    const req = JSON.parse(fs.readFileSync(path.join(dir, 'requests.json'), 'utf8'));
    expect(req.synthetic).toBe(true);
    expect(req.calls.map((c: { method: string }) => c.method)).toEqual(['createSpreadsheet', 'batchUpdate', 'valuesBatchUpdate', 'batchUpdate']);
    expect(req.charts).toHaveLength(1);
    expect(result.chartCreated).toBe(true);
  });
});

describe('CLI sheets:sync', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.STORE_DIR = fixtureStoreDir();
    process.env.SHEETS_PREVIEW_DIR = tmpDir('indec-cli-preview-');
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('sin credenciales cae en vista previa automática', async () => {
    process.env.GOOGLE_AUTH_MODE = 'oauth';
    process.env.GOOGLE_OAUTH_CLIENT_ID = '';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = '';
    const { main } = await import('../../src/sheets/cli/sync');
    const code = await main(['--topic=comex']);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(process.env.SHEETS_PREVIEW_DIR!, 'comex', 'requests.json'))).toBe(true);
  });

  it('con credenciales, rechaza datos sintéticos sin --allow-synthetic (antes de tocar Google)', async () => {
    const key = path.join(tmpDir('indec-sa-'), 'clave-falsa.json');
    fs.writeFileSync(key, '{}');
    process.env.GOOGLE_AUTH_MODE = 'service_account';
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE = key;
    const { main } = await import('../../src/sheets/cli/sync');
    expect(await main(['--topic=comex'])).toBe(2);
  });

  it('OAuth configurado sin token: error accionable (no cae en vista previa)', async () => {
    process.env.GOOGLE_AUTH_MODE = 'oauth';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'x.apps.googleusercontent.com';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 's';
    process.env.GOOGLE_OAUTH_TOKEN_PATH = path.join(tmpDir('indec-tok-'), 'no-existe.json');
    const { main } = await import('../../src/sheets/cli/sync');
    expect(await main(['--topic=comex'])).toBe(1);
    expect(fs.existsSync(path.join(process.env.SHEETS_PREVIEW_DIR!, 'comex'))).toBe(false);
    // con --dry-run explícito sí genera la vista previa
    expect(await main(['--dry-run', '--topic=comex'])).toBe(0);
  });

  it('valida argumentos', async () => {
    const { parseArgs } = await import('../../src/sheets/cli/sync');
    expect(parseArgs(['--dry-run', '--topic', 'precios,comex'])).toMatchObject({ dryRun: true, topics: ['precios', 'comex'] });
    expect(() => parseArgs(['--topic=pbi'])).toThrow(/Tema desconocido/);
  });
});
