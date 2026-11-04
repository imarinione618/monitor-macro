import { describe, expect, it } from 'vitest';
import { DATASETS } from '../../src/core/datasets';
import { SERIES, getSeries } from '../../src/core/registry';
import type { DatasetId, SeriesDef } from '../../src/core/types';
import {
  buildApiSeries,
  buildDerivedSeries,
  flagsFromNote,
  flagsFromSign,
  indexRows,
  rowPeriod,
  validateObservations,
} from '../../src/ingest/normalize';
import { realFixture } from './helpers';

const build = (id: string, fixture: string) => {
  const def = getSeries(id);
  const ds = DATASETS[(def.source as { dataset: DatasetId }).dataset];
  return buildApiSeries(def, ds, indexRows(ds, realFixture(fixture)));
};

const custom = (base: string, patch: Partial<SeriesDef['source']> & Record<string, unknown>): SeriesDef => {
  const def = getSeries(base);
  return { ...def, id: `${base}.test`, source: { ...(def.source as object), ...patch } as SeriesDef['source'] };
};

describe('signos y observaciones', () => {
  it('mapea los signos convencionales de la columna <col>_null', () => {
    expect(flagsFromSign('///').flags).toEqual(['no_corresponde']);
    expect(flagsFromSign('s').flags).toEqual(['confidencial']);
    expect(flagsFromSign('-').flags).toEqual(['cero_absoluto']);
    expect(flagsFromSign('...').flags).toEqual(['no_disponible']);
    expect(flagsFromSign('**').flags).toEqual(['preliminar']);
    expect(flagsFromSign(null).flags).toEqual([]);
    expect(flagsFromSign('zz')).toEqual({ flags: [], unknown: 'zz' });
  });
  it('interpreta textos de observaciones', () => {
    expect(flagsFromNote('* Dato provisorio')).toEqual(['provisorio']);
    expect(flagsFromNote('Dato provisorio')).toEqual(['provisorio']);
    expect(flagsFromNote('** Dato preliminar')).toEqual(['preliminar']);
    expect(flagsFromNote('Los resultados del tercer trimestre de 2019 no incluyen el aglomerado Gran Resistencia.')).toEqual([]);
    expect(flagsFromNote(null)).toEqual([]);
  });
});

describe('períodos', () => {
  it('mensual, trimestral EPH y semestral EPH, coherentes con anio/mes/trimestre/semestre', () => {
    expect(rowPeriod(DATASETS.ipc_nacional, { periodo: '202409', anio: 2024, mes: 9 })).toBe('2024-09');
    expect(rowPeriod(DATASETS.comercio_exterior_exportacion_bienes, { Periodo: '202409', Anio: 2024, Mes: 9 })).toBe('2024-09');
    expect(rowPeriod(DATASETS.mercado_trabajo_eph, { periodo: '20162T', anio: 2016, trimestre: 2 })).toBe('2016-Q2');
    expect(rowPeriod(DATASETS.pobreza_eph, { periodo: '20261S', anio: 2026, semestre: 1 })).toBe('2026-S1');
  });
  it('rechaza períodos incoherentes o mal formados', () => {
    expect(() => rowPeriod(DATASETS.ipc_nacional, { periodo: '202409', anio: 2024, mes: 10 })).toThrow(/incoherente/);
    expect(() => rowPeriod(DATASETS.ipc_nacional, { periodo: '2024-09', anio: 2024, mes: 9 })).toThrow(/inválido/);
    expect(() => rowPeriod(DATASETS.mercado_trabajo_eph, { periodo: '20165T', anio: 2016, trimestre: 5 })).toThrow();
  });
});

describe('normalización con respuestas reales', () => {
  it('EMAE: serie original y variación publicada (nulos "///" iniciales recortados)', () => {
    const orig = build('actividad.emae.total.orig', 'emae-nivel-general');
    expect(orig.issues).toEqual([]);
    expect(orig.observations.map((o) => o.period)).toEqual(['2004-01', '2004-02', '2026-07', '2026-08']);
    expect(orig.observations[3]!.value).toBeCloseTo(147.75319588401308, 10);
    const via = build('actividad.emae.total.orig.var_ia_pub', 'emae-nivel-general');
    expect(via.observations.map((o) => o.period)).toEqual(['2026-07', '2026-08']);
  });

  it('IPC: nivel general nacional, categorías y v_m publicada, una fila por período', () => {
    for (const id of ['precios.ipc.ng.nacional', 'precios.ipc.ng.nacional.var_m_pub', 'precios.ipc.cat.nucleo.nacional', 'precios.ipc.cat.regulados.nacional', 'precios.ipc.cat.estacionales.nacional', 'precios.ipc.cat.bienes.nacional', 'precios.ipc.cat.servicios.nacional']) {
      const b = build(id, 'ipc-nacional');
      expect(b.issues, id).toEqual([]);
      expect(b.observations.map((o) => o.period), id).toEqual(['2026-08', '2026-09']);
      expect(b.matchedRows, id).toBe(2);
    }
  });

  it('Salarios: "///" antes de la base se recorta; base oct-2016 = 100', () => {
    const b = build('laboral.salarios.total', 'salarios');
    expect(b.observations[0]).toEqual({ period: '2016-10', value: 100 });
    expect(b.observations.at(-1)!.period).toBe('2026-08');
    const reg = build('laboral.salarios.privado_registrado', 'salarios');
    expect(reg.observations[0]!.period).toBe('2016-09');
  });

  it('EPH: tasas por columna, "Dato provisorio" como flag y notas de cobertura', () => {
    const d = build('laboral.eph.desocupacion', 'eph-tasas');
    expect(d.observations.map((o) => o.period)).toEqual(['2019-Q3', '2023-Q3', '2023-Q4', '2026-Q1', '2026-Q2']);
    const last = d.observations.at(-1)!;
    expect(last.value).toBe(7.9);
    expect(last.flags).toEqual(['provisorio']);
    expect(last.rawNote).toBe('Dato provisorio');
    expect(d.observations[0]!.rawNote).toMatch(/Gran Resistencia/);
    // empleo formal: null sin signo antes de 4T-2023 → la serie empieza en 2023-Q4
    const f = build('laboral.eph.empleo_formal', 'eph-tasas');
    expect(f.observations[0]!.period).toBe('2023-Q4');
    expect(f.observations.every((o) => o.value !== null)).toBe(true);
  });

  it('Pobreza: períodos semestrales', () => {
    const p = build('laboral.pobreza.pobreza_personas', 'pobreza');
    expect(p.observations).toEqual([
      { period: '2025-S2', value: 28.2 },
      { period: '2026-S1', value: 32.3, flags: ['provisorio'], rawNote: 'Dato provisorio' },
    ]);
  });

  it('ICC: "* Dato provisorio" → provisorio; v_ia "///" → no_corresponde con valor null', () => {
    const ng = build('precios.icc.ng', 'icc');
    expect(ng.observations.at(-1)!.flags).toEqual(['provisorio']);
    const via = buildApiSeries(
      custom('precios.icc.ng', { selector: { codigo_apertura: '0', clasificador: 'ICC 93', tipo_de_indicador: 'v_ia' } }),
      DATASETS.icc_precios_construccion,
      indexRows(DATASETS.icc_precios_construccion, realFixture('icc')),
    );
    // el único período con v_ia en la muestra es "///" → serie sin valores
    expect(via.issues).toContain('la serie no tiene ningún valor publicado (todos nulos)');
  });

  it('IPI manufacturero: signo "-" (cero absoluto) llega con valor null y se conserva null + flag', () => {
    const ds = DATASETS.ipi_manufacturero;
    const rows = indexRows(ds, realFixture('ipi-manufacturero'));
    const def = custom('actividad.ipi_manuf.total.orig', {
      selector: { codigo_CLaNAE_2004: '16001', cuadro_web: 'Cuadro 3' },
    });
    const b = buildApiSeries({ ...def, measure: 'published_change' }, ds, rows);
    expect(b.matchedRows).toBe(1);
    // todo nulo → se recorta; verificamos el flag en la fila cruda
    const raw = realFixture('ipi-manufacturero').find((r) => r.cuadro_web === 'Cuadro 3')!;
    expect(raw.valor).toBeNull();
    expect(flagsFromSign(raw.valor_null).flags).toEqual(['cero_absoluto']);
    // bloques y nivel general: una fila por período
    for (const id of ['actividad.ipi_manuf.total.orig', 'actividad.ipi_manuf.total.sa', 'actividad.ipi_manuf.alimentos.orig', 'actividad.ipi_manuf.alimentos.sa']) {
      const s = buildApiSeries(getSeries(id), ds, rows);
      expect(s.issues, id).toEqual([]);
      expect(s.observations, id).toHaveLength(1);
    }
  });

  it('SIPM: nivel general y aperturas del IPIM identificadas sin ambigüedad', () => {
    for (const id of ['precios.sipm.ipim.ng', 'precios.sipm.ipim.nacional', 'precios.sipm.ipim.importado', 'precios.sipm.ipim.primarios', 'precios.sipm.ipim.manuf_energia']) {
      const b = build(id, 'sipm');
      expect(b.issues, id).toEqual([]);
      expect(b.matchedRows, id).toBe(1);
      expect(b.observations[0]!.flags, id).toEqual(['provisorio']);
    }
  });

  it('Canastas: CBA/CBT adulto equivalente y hogar 2', () => {
    for (const id of ['precios.canastas.cba_adulto', 'precios.canastas.cbt_adulto', 'precios.canastas.cbt_hogar2']) {
      const b = build(id, 'canastas');
      expect(b.issues, id).toEqual([]);
      expect(b.observations.map((o) => o.period), id).toEqual(['2026-08', '2026-09']);
    }
  });

  it('Comercio: suma por período excluye celdas "s" (no las trata como cero) y escala a millones', () => {
    const rows = realFixture('comex-expo-202409');
    const cn = build('comex.expo.pais.china', 'comex-expo-202409');
    const expected = rows.filter((r) => r.pais_cod === 'CN' && r.valor_FOB !== null).reduce((a, r) => a + (r.valor_FOB as number), 0) * 1e-6;
    expect(cn.observations).toHaveLength(1);
    expect(cn.observations[0]!.value).toBeCloseTo(expected, 9);
    expect(cn.suppressedRows).toBe(1);
    expect(cn.observations[0]!.flags).toBeUndefined();
    const conf = build('comex.expo.rubro.confidencial', 'comex-expo-202409');
    expect(conf.observations[0]!.value).toBeCloseTo(811.4569736, 6);
    // país con todas sus celdas confidenciales → null (no 0) con flag
    const ae = buildApiSeries(custom('comex.expo.pais.china', { selector: { pais_cod: 'AE' } }), DATASETS.comercio_exterior_exportacion_bienes, indexRows(DATASETS.comercio_exterior_exportacion_bienes, rows));
    expect(ae.suppressedRows).toBe(1);
    expect(ae.issues).toContain('la serie no tiene ningún valor publicado (todos nulos)');
  });

  it('Importaciones CIF por uso económico', () => {
    const bk = build('comex.impo.uso.bk', 'comex-impo-202409');
    const rows = realFixture('comex-impo-202409').filter((r) => r.uso_economico_cod === '1');
    expect(bk.observations[0]!.value).toBeCloseTo(rows.reduce((a, r) => a + (r.valor_CIF as number), 0) / 1e6, 9);
  });
});

describe('errores de identificación', () => {
  it('duplicados: un selector ambiguo (sin tipo de indicador) es error de datos', () => {
    const def = custom('precios.ipc.ng.nacional', { selector: { clasificador: 'IPC', codigo: '0', region: 'Nacional' } });
    const b = buildApiSeries(def, DATASETS.ipc_nacional, indexRows(DATASETS.ipc_nacional, realFixture('ipc-nacional')));
    expect(b.issues.join()).toMatch(/duplicados/);
    expect(b.observations).toEqual([]);
  });
  it('selector sin coincidencias es error de datos', () => {
    const def = custom('precios.ipc.ng.nacional', { selector: { clasificador: 'IPC', codigo: '99', region: 'Nacional', tipo_de_indicador: 'Indice' } });
    const b = buildApiSeries(def, DATASETS.ipc_nacional, indexRows(DATASETS.ipc_nacional, realFixture('ipc-nacional')));
    expect(b.issues.join()).toMatch(/no coincide con ninguna fila/);
  });
  it('columna de valor inexistente', () => {
    const def = custom('laboral.eph.desocupacion', { valueField: 'tasa_inexistente' });
    const b = buildApiSeries(def, DATASETS.mercado_trabajo_eph, indexRows(DATASETS.mercado_trabajo_eph, realFixture('eph-tasas')));
    expect(b.issues.join()).toMatch(/no existe/);
  });
  it('faltante intermedio queda null (nunca 0)', () => {
    const rows = realFixture('salarios').map((r) => (r.codigo === '0' && r.periodo === '201610' ? { ...r, valor: null, valor_null: '...' } : r));
    const b = buildApiSeries(getSeries('laboral.salarios.total'), DATASETS.indice_salarios, indexRows(DATASETS.indice_salarios, rows));
    // 2016-10 pasa a ser nulo inicial → recortado; la serie empieza en 2026-08
    expect(b.observations.map((o) => o.period)).toEqual(['2026-08']);
    const rows2 = realFixture('salarios').map((r) => (r.codigo === '110' && r.periodo === '201610' ? { ...r, valor: null, valor_null: '...' } : r));
    const b2 = buildApiSeries(getSeries('laboral.salarios.privado_registrado'), DATASETS.indice_salarios, indexRows(DATASETS.indice_salarios, rows2));
    expect(b2.observations[1]).toEqual({ period: '2016-10', value: null, flags: ['no_disponible'] });
  });
});

describe('registro', () => {
  it('toda serie API apunta a un dataset con la misma frecuencia', () => {
    for (const s of SERIES) {
      if (s.source.kind !== 'api') continue;
      expect(DATASETS[s.source.dataset].frequency, s.id).toBe(s.frequency);
    }
  });
});

describe('derivadas y validación', () => {
  it('salario real con realIndex y saldo con differenceSeries', () => {
    const nominal = [
      { period: '2016-12', value: 110 },
      { period: '2017-01', value: 121 },
    ];
    const ipc = [
      { period: '2016-12', value: 100 },
      { period: '2017-01', value: 110 },
    ];
    const real = buildDerivedSeries(getSeries('laboral.salarios.registrado_real'), (id) => (id === 'precios.ipc.ng.nacional' ? ipc : nominal));
    expect(real.issues).toEqual([]);
    expect(real.observations[0]!.value).toBeCloseTo(100, 12);
    expect(real.observations[1]!.value).toBeCloseTo(100, 12);
    const saldo = buildDerivedSeries(getSeries('comex.saldo'), (id) => (id === 'comex.expo.total' ? [{ period: '2024-09', value: 6952.88 }] : [{ period: '2024-09', value: 5970.96 }]));
    expect(saldo.observations[0]!.value).toBeCloseTo(981.92, 9);
    const missing = buildDerivedSeries(getSeries('comex.saldo'), () => null);
    expect(missing.issues.join()).toMatch(/falta la serie de entrada/);
  });
  it('validateObservations detecta desorden, duplicados y períodos inválidos', () => {
    const def = { id: 'x', frequency: 'M' as const };
    expect(validateObservations(def, [{ period: '2024-02', value: 1 }, { period: '2024-01', value: 1 }])[0]).toMatch(/desordenados/);
    expect(validateObservations(def, [{ period: '2024-01', value: 1 }, { period: '2024-01', value: 2 }])[0]).toMatch(/duplicados/);
    expect(validateObservations(def, [{ period: '2024-Q1', value: 1 }])[0]).toMatch(/inválido/);
    expect(validateObservations(def, [{ period: '2024-01', value: null }])[0]).toMatch(/sin valores/);
    expect(validateObservations(def, [{ period: '2024-01', value: 1 }])).toEqual([]);
  });
});
