import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BcraClient, normalizeBcraObservations } from '../../src/monetary/client';
import { MONETARY_CATALOG } from '../../src/monetary/catalog';
import { refreshMonetary, reconcileObservations } from '../../src/monetary/refresh';
import { readMonetarySeries } from '../../src/monetary/store';
import type { BcraMetadata } from '../../src/monetary/types';

const dirs: string[] = [];
const tmp = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-bcra-')); dirs.push(dir); return dir; };
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const def = MONETARY_CATALOG.find(d => d.bcraId === 44)!;
const metadata: BcraMetadata = { idVariable: 44, descripcion: def.name, categoria: 'Principales Variables', tipoSerie: 'Tasa de interés', periodicidad: 'D', unidadExpresion: def.originalUnit, moneda: 'ML', primerFechaInformada: '2024-10-01', ultFechaInformada: '2024-10-03', ultValorInformado: 32 };
const observations = [{ date: '2024-10-01', value: 30 }, { date: '2024-10-02', value: 31 }, { date: '2024-10-03', value: 32 }];

describe('ingesta monetaria BCRA v4', () => {
  it('normaliza miles a millones, preserva null y cero y ordena', () => {
    expect(normalizeBcraObservations([{ fecha: '2024-02-02', valor: null }, { fecha: '2024-02-01', valor: 3000 }, { fecha: '2024-02-03', valor: 0 }], .001)).toEqual([{ date: '2024-02-01', value: 3 }, { date: '2024-02-02', value: null }, { date: '2024-02-03', value: 0 }]);
  });
  it.each([
    [{ fecha: '2024-02-30', valor: 2 }], [{ fecha: '2024-01-01', valor: '1.234,5' }],
    [{ fecha: '2024-01-01', valor: 1 }, { fecha: '2024-01-01', valor: 1 }],
    [{ fecha: '2024-01-01', valor: Number.NaN }],
  ])('rechaza fechas, tipos y duplicados inválidos (%j)', (...rows) => { expect(() => normalizeBcraObservations(rows)).toThrow(); });

  it('interpreta detalle anidado del contrato v4, no respuestas v3', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 200, metadata: { resultset: { count: 1, offset: 0, limit: 3000 } }, results: [{ idVariable: 44, detalle: [{ fecha: '2024-10-01', valor: 30 }] }] })));
    const client = new BcraClient({ fetch: fetcher, cacheDir: null, retries: 0 });
    expect(await client.observations(44, '2024-10-01', '2024-10-03')).toEqual([observations[0]]);
    expect(fetcher.mock.calls[0]![0]).toContain('/estadisticas/v4.0/monetarias/44?desde=2024-10-01');
  });
  it('rechaza respuestas truncadas o IDs distintos', async () => {
    for (const id of [44, 7]) {
      const client = new BcraClient({ cacheDir: null, retries: 0, fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 200, metadata: { resultset: { count: 2, offset: 0, limit: 3000 } }, results: [{ idVariable: id, detalle: [] }] }))) });
      await expect(client.observations(44, '2024-10-01', '2024-10-03')).rejects.toThrow();
    }
  });
  it('reconcilia por fecha y elimina observaciones retiradas dentro de la ventana', () => {
    expect(reconcileObservations(observations, [{ date: '2024-10-03', value: 33 }], '2024-10-02', '2024-10-03')).toEqual([observations[0], { date: '2024-10-03', value: 33 }]);
  });
  it('actualiza valores históricos, registra revisión y conserva último conjunto ante falla', async () => {
    const dir = tmp();
    const client = { catalog: vi.fn().mockResolvedValue([metadata]), observations: vi.fn().mockResolvedValue(observations) };
    const options = { dir, catalog: [def], client, log: () => {}, now: () => new Date('2024-10-04T12:00:00Z') };
    expect((await refreshMonetary(options)).ok).toBe(true);
    client.observations.mockResolvedValue([{ ...observations[0], value: 29 }, observations[1], observations[2]]);
    expect((await refreshMonetary(options)).revisions).toBe(1);
    expect(readMonetarySeries(def.id, dir)?.observations[0]?.value).toBe(29);
    client.observations.mockRejectedValue(new Error('BCRA no disponible'));
    expect((await refreshMonetary(options)).ok).toBe(false);
    expect(readMonetarySeries(def.id, dir)?.stale).toBe(true);
    expect(readMonetarySeries(def.id, dir)?.observations[0]?.value).toBe(29);
    expect(fs.readFileSync(path.join(dir, 'revisions.jsonl'), 'utf8')).toContain('"kind":"revised"');
  });
  it('rechaza cambios de unidad sin sobrescribir el dato previo', async () => {
    const dir = tmp();
    const client = { catalog: vi.fn().mockResolvedValue([metadata]), observations: vi.fn().mockResolvedValue(observations) };
    const options = { dir, catalog: [def], client, log: () => {}, now: () => new Date('2024-10-04T12:00:00Z') };
    await refreshMonetary(options);
    client.catalog.mockResolvedValue([{ ...metadata, unidadExpresion: 'En porcentaje efectivo anual' }]);
    expect((await refreshMonetary(options)).ok).toBe(false);
    expect(readMonetarySeries(def.id, dir)?.observations).toEqual(observations);
    expect(client.observations).toHaveBeenCalledTimes(1);
  });
  it('audita monedas y componentes: LEFI y activos no son pasivos elegibles', () => {
    expect(MONETARY_CATALOG.filter(d => d.eligibleInstrument).map(d => d.bcraId)).toEqual([198, 1258, 1260, 1262]);
    expect(MONETARY_CATALOG.find(d => d.bcraId === 196)?.issuer).toBe('Tesoro Nacional');
    expect(MONETARY_CATALOG.find(d => d.bcraId === 1263)?.balanceSide).toBe('asset');
    expect(MONETARY_CATALOG.find(d => d.bcraId === 1606)?.scale).toBe(.001);
    expect(MONETARY_CATALOG.some(d => d.bcraId === 992 || d.bcraId === 893)).toBe(false);
    expect(MONETARY_CATALOG.find(d => d.bcraId === 108)?.currency).toBe('USD');
    expect(MONETARY_CATALOG.some(d => d.bcraId === 1494)).toBe(false);
  });
});
