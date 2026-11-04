import type { SeriesDef } from '../types';

const EXPO = 'comercio_exterior_exportacion_bienes' as const;
const IMPO = 'comercio_exterior_importacion_bienes' as const;

const flowBase = {
  topic: 'comex',
  frequency: 'M',
  measure: 'flow',
  unit: 'Millones de USD',
  seasonalAdjustment: 'original',
  geography: 'Total país',
  status: 'verificado',
} as const;

const SUM_NOTE =
  'Serie construida sumando las filas por rubro/uso y país de la API. El monto de operaciones confidenciales se incluye en el código 9 ("Confidencial"/"Resto"). Valores en USD corrientes; no son volúmenes.';

export const COMEX: SeriesDef[] = [
  {
    ...flowBase,
    id: 'comex.expo.total',
    family: 'comercio_totales',
    name: 'Exportaciones de bienes — Total (FOB)',
    shortName: 'Exportaciones',
    currency: 'USD corrientes, FOB',
    priority: 1,
    source: { kind: 'api', dataset: EXPO, selector: {}, valueField: 'valor_FOB', aggregate: 'sum', scaleFactor: 1e-6 },
    notes: [SUM_NOTE, 'Valuación FOB (libre a bordo).'],
  },
  {
    ...flowBase,
    id: 'comex.impo.total',
    family: 'comercio_totales',
    name: 'Importaciones de bienes — Total (CIF)',
    shortName: 'Importaciones',
    currency: 'USD corrientes, CIF',
    priority: 1,
    source: { kind: 'api', dataset: IMPO, selector: {}, valueField: 'valor_CIF', aggregate: 'sum', scaleFactor: 1e-6 },
    notes: [SUM_NOTE, 'Valuación CIF (incluye costo, seguro y flete).'],
  },
  {
    ...flowBase,
    id: 'comex.saldo',
    family: 'comercio_totales',
    name: 'Saldo comercial de bienes (exportaciones FOB − importaciones CIF)',
    shortName: 'Saldo comercial',
    measure: 'balance',
    currency: 'USD corrientes',
    priority: 1,
    source: { kind: 'derived', op: { type: 'difference', minuend: 'comex.expo.total', subtrahend: 'comex.impo.total' } },
    notes: [
      'Saldo del intercambio comercial de bienes según criterio INDEC (X FOB − M CIF). No es la cuenta corriente ni el balance cambiario.',
    ],
    headline: { order: 5, transform: 'level', compare: 'diff_yoy_abs' },
  },
  // ---------------- Exportaciones por grandes rubros
  ...(
    [
      ['1', 'pp', 'Productos primarios (sin confidencial)', 'PP (sin conf.)'],
      ['2', 'moa', 'Manufacturas de origen agropecuario (MOA) (sin confidencial)', 'MOA (sin conf.)'],
      ['3', 'moi', 'Manufacturas de origen industrial (MOI) (sin confidencial)', 'MOI (sin conf.)'],
      ['4', 'cye', 'Combustibles y energía (sin confidencial)', 'CyE (sin conf.)'],
      ['9', 'confidencial', 'Confidencial', 'Confidencial'],
    ] as const
  ).map(
    ([rubro_cod, slug, name, short]): SeriesDef => ({
      ...flowBase,
      id: `comex.expo.rubro.${slug}`,
      family: 'expo_rubros',
      name: `Exportaciones — ${name} (FOB)`,
      shortName: short,
      currency: 'USD corrientes, FOB',
      priority: slug === 'confidencial' ? 2 : 1,
      source: { kind: 'api', dataset: EXPO, selector: { rubro_cod }, valueField: 'valor_FOB', aggregate: 'sum', scaleFactor: 1e-6 },
      notes: [
        SUM_NOTE,
        'NO equivale a los rubros del Intercambio Comercial Argentino (ICA): desde ene-2018 la API deja las operaciones confidenciales en el rubro 9, mientras que el informe del INDEC las asigna a cada rubro. Los niveles de PP/MOA/MOI/CyE quedan subestimados (sep-2026: entre −6 % y −23 %) y hay un quiebre de serie en ene-2018: las variaciones interanuales de 2018 y las de rubros con mucha confidencialidad (p.ej. CyE) no son comparables con las publicadas. La suma de los 5 códigos sí reproduce el total.',
      ],
    }),
  ),
  // ---------------- Importaciones por usos económicos
  ...(
    [
      ['1', 'bk', 'Bienes de capital', 'Bienes de capital'],
      ['2', 'bi', 'Bienes intermedios', 'Bienes intermedios'],
      ['3', 'cyl', 'Combustibles y lubricantes', 'Combustibles y lubric.'],
      ['4', 'pyabk', 'Piezas y accesorios para bienes de capital', 'Piezas y acc. BK'],
      ['5', 'bc', 'Bienes de consumo', 'Bienes de consumo'],
      ['6', 'vap', 'Vehículos automotores de pasajeros', 'Vehículos'],
      ['9', 'resto', 'Resto', 'Resto'],
    ] as const
  ).map(
    ([uso_economico_cod, slug, name, short]): SeriesDef => ({
      ...flowBase,
      id: `comex.impo.uso.${slug}`,
      family: 'impo_usos',
      name: `Importaciones — ${name} (CIF)`,
      shortName: short,
      currency: 'USD corrientes, CIF',
      priority: slug === 'resto' ? 2 : 1,
      source: { kind: 'api', dataset: IMPO, selector: { uso_economico_cod }, valueField: 'valor_CIF', aggregate: 'sum', scaleFactor: 1e-6 },
      notes: [SUM_NOTE],
    }),
  ),
  // ---------------- Socios principales
  ...(
    [
      ['BR', 'brasil', 'Brasil'],
      ['CN', 'china', 'China'],
      ['US', 'eeuu', 'Estados Unidos'],
    ] as const
  ).flatMap(([pais_cod, slug, name]): SeriesDef[] => [
    {
      ...flowBase,
      id: `comex.expo.pais.${slug}`,
      family: 'socios',
      name: `Exportaciones a ${name} (FOB)`,
      shortName: `Expo ${name}`,
      currency: 'USD corrientes, FOB',
      priority: 2,
      source: { kind: 'api', dataset: EXPO, selector: { pais_cod }, valueField: 'valor_FOB', aggregate: 'sum', scaleFactor: 1e-6 },
      notes: [
        'Suma de las celdas publicadas para el país. Las celdas con secreto estadístico ("s") no se incluyen: el valor puede subestimar el comercio real con ese socio.',
      ],
    },
    {
      ...flowBase,
      id: `comex.impo.pais.${slug}`,
      family: 'socios',
      name: `Importaciones desde ${name} (CIF)`,
      shortName: `Impo ${name}`,
      currency: 'USD corrientes, CIF',
      priority: 2,
      source: { kind: 'api', dataset: IMPO, selector: { pais_cod }, valueField: 'valor_CIF', aggregate: 'sum', scaleFactor: 1e-6 },
      notes: ['Suma de las celdas publicadas para el país de origen.'],
    },
  ]),
];

export const COMEX_NO_DISPONIBLE = [
  'Índices de precios y cantidades de exportaciones e importaciones (ICA / IPC-IQ de comercio exterior)',
  'Términos del intercambio',
  'Balanza energética con valores oficiales específicos (aprox. disponible vía rubro "Combustibles y energía" y uso "Combustibles y lubricantes", que no son equivalentes a la balanza energética)',
];
