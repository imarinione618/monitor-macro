import { describe, expect, it } from 'vitest';
import { DATASETS } from '../../src/core/datasets';
import { parseArgs, parseDatasetIds } from '../../src/ingest/cli/common';
import { analyzeRows, renderCatalog } from '../../src/ingest/discover';
import { realFixture } from './helpers';

describe('argumentos de CLI', () => {
  it('acepta flags y valores repetibles o separados por coma', () => {
    const a = parseArgs(['--full', '--dataset', 'ipc_nacional,pobreza_eph', '--dataset=indice_salarios'], ['dataset'], ['full', 'no-cache']);
    expect(a.flags.has('full')).toBe(true);
    expect(a.values.get('dataset')).toEqual(['ipc_nacional', 'pobreza_eph', 'indice_salarios']);
    expect(parseDatasetIds(a.values.get('dataset'))).toHaveLength(3);
  });
  it('rechaza opciones y datasets desconocidos', () => {
    expect(() => parseArgs(['--bogus'], ['dataset'], ['full'])).toThrow(/Opción desconocida/);
    expect(() => parseArgs(['--dataset'], ['dataset'])).toThrow(/Falta el valor/);
    expect(() => parseDatasetIds(['no_existe'])).toThrow(/Dataset desconocido/);
  });
});

describe('relevamiento de dimensiones', () => {
  it('clasifica columnas de período, valor, signo, observaciones y dimensiones', () => {
    const { columns, combos } = analyzeRows(DATASETS.icc_precios_construccion, realFixture('icc'));
    const role = (n: string) => columns.find((c) => c.name === n)?.role;
    expect(role('periodo')).toBe('periodo');
    expect(role('valor')).toBe('valor');
    expect(role('valor_null')).toBe('signo');
    expect(role('observaciones')).toBe('observaciones');
    expect(role('codigo_apertura')).toBe('dimension');
    expect(columns.find((c) => c.name === 'valor_null')!.values.map((v) => v.value)).toContain('///');
    expect(combos[0]!.cols).toEqual(['clasificador', 'nivel']);
  });
  it('genera markdown con descripciones de nomenclaturas', () => {
    const rows = realFixture('comex-expo-202409');
    const md = renderCatalog(
      [{ id: 'comercio_exterior_exportacion_bienes', path: '/x', title: 'Expo', totalRows: 10, firstPeriod: '198601', lastPeriod: '202409', sample: 'muestra', sampleRows: rows.length, registrySeries: 9, ...analyzeRows(DATASETS.comercio_exterior_exportacion_bienes, rows) }],
      { rubro_cod: { '9': 'CONFIDENCIAL' } },
      '2026-11-04',
    );
    expect(md).toContain('`9` (CONFIDENCIAL)');
    expect(md).toContain('`valor_FOB_null`');
  });
});
