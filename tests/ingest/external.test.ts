import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FEEDS } from '../../src/core/feeds';
import { inSheets, SERIES, sheetsSeriesByTopic } from '../../src/core/registry';
import type { ExternalSourceSpec, Topic } from '../../src/core/types';
import { parseSspmCsv, periodFromIndex } from '../../src/ingest/external';
import { runRefresh } from '../../src/ingest/refresh';
import { readManifest, readSeriesData } from '../../src/core/store';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe('fuentes externas — CSV de datos.gob.ar', () => {
  it('convierte indice_tiempo a período canónico según frecuencia', () => {
    expect(periodFromIndex('2026-04-01', 'Q')).toBe('2026-Q2');
    expect(periodFromIndex('2026-09-01', 'M')).toBe('2026-09');
    expect(() => periodFromIndex('2026-05-01', 'Q')).toThrow();
    expect(() => periodFromIndex('2026-13-01', 'M')).toThrow();
  });
  it('parsea columnas, vacíos como null y rechaza filas mal formadas o duplicadas', () => {
    const out = parseSspmCsv('indice_tiempo,a,b\n2026-01-01,1.5,\n2026-02-01,-2,0\n', 'M');
    expect(out.a).toEqual([{ period: '2026-01', value: 1.5 }, { period: '2026-02', value: -2 }]);
    expect(out.b).toEqual([{ period: '2026-01', value: null }, { period: '2026-02', value: 0 }]);
    expect(() => parseSspmCsv('indice_tiempo,a\n2026-01-01,1,2\n', 'M')).toThrow();
    expect(() => parseSspmCsv('indice_tiempo,a\n2026-01-01,1\n2026-01-01,2\n', 'M')).toThrow();
    expect(() => parseSspmCsv('fecha,a\n2026-01-01,1\n', 'M')).toThrow();
    expect(() => parseSspmCsv('indice_tiempo,a\n2026-01-01,abc\n', 'M')).toThrow();
  });
  it('cada serie externa apunta a un feed existente con la misma frecuencia', () => {
    for (const s of SERIES.filter((x) => x.source.kind === 'external')) {
      const f = FEEDS[(s.source as ExternalSourceSpec).feed];
      expect(f, s.id).toBeDefined();
      expect(f!.frequency, s.id).toBe(s.frequency);
    }
  });
  it('nada de las fuentes nuevas ni del tema Fiscal va a Google Sheets', () => {
    for (const t of ['actividad', 'laboral', 'precios', 'comex'] as Topic[]) for (const s of sheetsSeriesByTopic(t)) expect(s.source.kind === 'external', s.id).toBe(false);
    for (const s of SERIES.filter((x) => x.topic === 'fiscal' || x.source.kind === 'external')) expect(inSheets(s), s.id).toBe(false);
    expect(inSheets(SERIES.find((s) => s.id === 'actividad.emae.total.orig')!)).toBe(true);
  });
  it('runRefresh: carga feeds, recorta nulos de borde, convierte ceros previos a null y conserva datos ante falla', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-ext-')); dirs.push(dir);
    const store = path.join(dir, 'store');
    const defs = SERIES.filter((s) => s.id === 'actividad.oyd.discrepancia.orig' || s.id === 'actividad.pib.total.orig');
    let fail = false;
    const loader = async () => {
      if (fail) throw new Error('HTTP 500');
      return { feed: 'sspm.oyd_constantes', url: 'x', retrievedAt: '2026-11-06T12:00:00Z', series: {
        oferta_global_pib: [{ period: '2023-Q4', value: null }, { period: '2024-Q1', value: 100 }, { period: '2024-Q2', value: 101 }],
        discrepancia_estadistica: [{ period: '2023-Q4', value: 0 }, { period: '2024-Q1', value: 5 }, { period: '2024-Q2', value: -3 }],
      } };
    };
    const common = { client: {} as never, storeDir: store, lockFile: path.join(dir, '.lock'), runsDir: null, series: defs, skipIndec: true, feedLoaders: { sspm_csv: loader }, log: () => {} };
    const ok = await runRefresh(common);
    expect(ok.ok).toBe(true);
    expect(readSeriesData('actividad.pib.total.orig', store)!.observations.map((o) => o.period)).toEqual(['2024-Q1', '2024-Q2']);
    expect(readSeriesData('actividad.oyd.discrepancia.orig', store)!.observations).toEqual([{ period: '2024-Q1', value: 5 }, { period: '2024-Q2', value: -3 }]);
    fail = true;
    const bad = await runRefresh(common);
    expect(bad.ok).toBe(false);
    expect(readSeriesData('actividad.pib.total.orig', store)!.meta.stale).toBe(true);
    expect(readManifest(store)!.feeds!['sspm.oyd_constantes']!.ok).toBe(false);
  });
});
