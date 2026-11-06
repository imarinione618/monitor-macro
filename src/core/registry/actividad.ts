import type { SeriesDef } from '../types';

const EMAE_NG = 'estimador-mensual-de-actividad-economica-nivel-general' as const;
const EMAE_SEC = 'estimador-mensual-de-actividad-economica-sectores' as const;

const emaeBase = {
  topic: 'actividad',
  family: 'emae',
  frequency: 'M',
  measure: 'index',
  unit: 'Índice base 2004=100',
  base: '2004=100',
  geography: 'Total país',
  priority: 1,
  status: 'verificado',
} as const;

/** Bloques del IPI manufacturero: [código CLaNAE 2004 en la API, slug, nombre, nombre corto]. */
const IPI_BLOQUES = [
  ['15', 'alimentos', 'Alimentos y bebidas', 'Alimentos y bebidas'],
  ['16', 'tabaco', 'Productos de tabaco', 'Tabaco'],
  ['17', 'textiles', 'Productos textiles', 'Textiles'],
  ['18-19', 'prendas_cuero', 'Prendas de vestir, cuero y calzado', 'Prendas, cuero y calzado'],
  ['20-22', 'madera_papel', 'Madera, papel, edición e impresión', 'Madera, papel e impresión'],
  ['23', 'refinacion', 'Refinación del petróleo, coque y combustible nuclear', 'Refinación de petróleo'],
  ['24', 'quimicos', 'Sustancias y productos químicos', 'Químicos'],
  ['25', 'caucho_plastico', 'Productos de caucho y plástico', 'Caucho y plástico'],
  ['26', 'minerales_no_metalicos', 'Productos minerales no metálicos', 'Minerales no metálicos'],
  ['27', 'metalicas_basicas', 'Industrias metálicas básicas', 'Metálicas básicas'],
  ['28', 'productos_metal', 'Productos de metal', 'Productos de metal'],
  ['29', 'maquinaria', 'Maquinaria y equipo', 'Maquinaria y equipo'],
  ['30-33', 'equipos_instrumentos', 'Otros equipos, aparatos e instrumentos', 'Otros equipos e instrumentos'],
  ['34', 'automotores', 'Vehículos automotores, carrocerías, remolques y autopartes', 'Automotores'],
  ['35', 'otro_transporte', 'Otro equipo de transporte', 'Otro equipo de transporte'],
  ['36-38', 'muebles_otras', 'Muebles y colchones, y otras industrias manufactureras', 'Muebles y otras'],
] as const;

const EMAE_VARIANTS = {
  original: 'actividad.emae.total.orig',
  desestacionalizada: 'actividad.emae.total.sa',
  'tendencia-ciclo': 'actividad.emae.total.tc',
} as const;

export const ACTIVIDAD: SeriesDef[] = [
  {
    ...emaeBase,
    id: 'actividad.emae.total.orig',
    name: 'EMAE — Nivel general, serie original',
    shortName: 'EMAE original',
    seasonalAdjustment: 'original',
    source: { kind: 'api', dataset: EMAE_NG, selector: { tipo_de_indicador_descripcion: 'Índice serie original' } },
    seasonalVariants: EMAE_VARIANTS,
    headline: { order: 2, transform: 'pct_yoy' },
  },
  {
    ...emaeBase,
    id: 'actividad.emae.total.sa',
    name: 'EMAE — Nivel general, serie desestacionalizada',
    shortName: 'EMAE desest.',
    seasonalAdjustment: 'desestacionalizada',
    source: { kind: 'api', dataset: EMAE_NG, selector: { tipo_de_indicador_descripcion: 'Índice serie desestacionalizada' } },
    seasonalVariants: EMAE_VARIANTS,
    notes: ['La serie desestacionalizada se re-estima completa con cada publicación: los valores históricos cambian.'],
    headline: { order: 3, transform: 'pct_prev' },
  },
  {
    ...emaeBase,
    id: 'actividad.emae.total.tc',
    name: 'EMAE — Nivel general, tendencia-ciclo',
    shortName: 'EMAE tend.-ciclo',
    seasonalAdjustment: 'tendencia-ciclo',
    source: { kind: 'api', dataset: EMAE_NG, selector: { tipo_de_indicador_descripcion: 'Índice serie tendencia-ciclo' } },
    seasonalVariants: EMAE_VARIANTS,
  },
  // Variaciones publicadas (para contrastar con las calculadas; no se re-transforman)
  {
    ...emaeBase,
    id: 'actividad.emae.total.orig.var_ia_pub',
    name: 'EMAE — Var. % interanual publicada (serie original)',
    shortName: 'EMAE var. i.a. publicada',
    measure: 'published_change',
    unit: '%',
    seasonalAdjustment: 'original',
    priority: 2,
    source: { kind: 'api', dataset: EMAE_NG, selector: { tipo_de_indicador_descripcion: 'Var % interanual serie original' } },
  },
  {
    ...emaeBase,
    id: 'actividad.emae.total.sa.var_m_pub',
    name: 'EMAE — Var. % mensual publicada (desestacionalizada)',
    shortName: 'EMAE var. m/m publicada',
    measure: 'published_change',
    unit: '%',
    seasonalAdjustment: 'desestacionalizada',
    priority: 2,
    source: { kind: 'api', dataset: EMAE_NG, selector: { tipo_de_indicador_descripcion: 'Var % mensual serie desestacionalizada' } },
  },
  // ---------------- EMAE por sectores (solo serie original en la API)
  ...(
    [
      ['A', 'agro', 'Agricultura, ganadería, caza y silvicultura', 'Agro'],
      ['B', 'pesca', 'Pesca', 'Pesca'],
      ['C', 'mineria', 'Explotación de minas y canteras', 'Minería'],
      ['D', 'industria', 'Industria manufacturera', 'Industria'],
      ['E', 'ega', 'Electricidad, gas y agua', 'Electricidad, gas y agua'],
      ['F', 'construccion', 'Construcción', 'Construcción'],
      ['G', 'comercio', 'Comercio mayorista, minorista y reparaciones', 'Comercio'],
      ['H', 'hoteles', 'Hoteles y restaurantes', 'Hoteles y restaurantes'],
      ['I', 'transporte', 'Transporte y comunicaciones', 'Transporte y comunic.'],
      ['J', 'financiero', 'Intermediación financiera', 'Interm. financiera'],
      ['K', 'inmobiliarias', 'Actividades inmobiliarias, empresariales y de alquiler', 'Inmobiliarias'],
      ['L', 'adm_publica', 'Administración pública y defensa', 'Adm. pública'],
      ['M', 'ensenanza', 'Enseñanza', 'Enseñanza'],
      ['N', 'salud', 'Servicios sociales y de salud', 'Salud'],
      ['O', 'otros_servicios', 'Otras actividades de servicios comunitarios, sociales y personales', 'Otros servicios'],
      ['T_S', 'impuestos', 'Impuestos netos de subsidios', 'Impuestos netos'],
    ] as const
  ).map(
    ([codigo, slug, name, short]): SeriesDef => ({
      ...emaeBase,
      id: `actividad.emae_sector.${slug}.orig`,
      family: 'emae_sectores',
      name: `EMAE — ${name} (serie original)`,
      shortName: short,
      seasonalAdjustment: 'original',
      priority: 2,
      source: { kind: 'api', dataset: EMAE_SEC, selector: { codigo, tipo_de_indicador: 'Índice base 2004=100' } },
      notes: ['La API publica los sectores solo como serie original: comparar interanualmente, no mes contra mes.'],
    }),
  ),
  // ---------------- IPI manufacturero
  ...(
    [
      ['orig', 'original', 'Serie original'],
      ['sa', 'desestacionalizada', 'Serie desestacionalizada'],
      ['tc', 'tendencia-ciclo', 'Serie tendencia-ciclo'],
    ] as const
  ).map(
    ([suf, sa, serie]): SeriesDef => ({
      id: `actividad.ipi_manuf.total.${suf}`,
      topic: 'actividad',
      family: 'ipi_manufacturero',
      name: `IPI manufacturero — Nivel general, ${serie.toLowerCase()}`,
      shortName: `IPI manuf. ${suf === 'orig' ? 'original' : suf === 'sa' ? 'desest.' : 'tend.-ciclo'}`,
      frequency: 'M',
      measure: 'index',
      unit: 'Índice base 2004=100',
      base: '2004=100',
      seasonalAdjustment: sa,
      geography: 'Total país',
      priority: 1,
      status: 'verificado',
      source: {
        kind: 'api',
        dataset: 'ipi_manufacturero',
        selector: { codigo_CLaNAE_2004: 'D', serie, tipo_de_indicador: 'Índice' },
      },
      seasonalVariants: {
        original: 'actividad.ipi_manuf.total.orig',
        desestacionalizada: 'actividad.ipi_manuf.total.sa',
        'tendencia-ciclo': 'actividad.ipi_manuf.total.tc',
      },
      headline: suf === 'sa' ? { order: 4, transform: 'pct_prev', compare: undefined } : undefined,
    }),
  ),
  // ---------------- IPI minero: nivel general, base 2016=100
  ...([
    ['orig', 'original', 'Serie Original'],
    ['sa', 'desestacionalizada', 'Serie Desestacionalizada'],
    ['tc', 'tendencia-ciclo', 'Serie Tendencia-Ciclo'],
  ] as const).map(([suf, adjustment, serie]): SeriesDef => ({
    id: `actividad.ipi_minero.total.${suf}`,
    topic: 'actividad',
    family: 'ipi_minero',
    name: `IPI minero — Nivel general, ${serie.toLowerCase()}`,
    shortName: `IPI minero ${suf === 'orig' ? 'original' : suf === 'sa' ? 'desest.' : 'tend.-ciclo'}`,
    frequency: 'M',
    measure: 'index',
    unit: 'Índice base 2016=100',
    base: '2016=100',
    seasonalAdjustment: adjustment,
    geography: 'Total país',
    priority: 1,
    status: 'verificado',
    source: { kind: 'api', dataset: 'ipi_minero', selector: { codigo_ClaNAE_2010: 'B', serie, tipo_de_indicador: 'Índice' } },
    seasonalVariants: {
      original: 'actividad.ipi_minero.total.orig',
      desestacionalizada: 'actividad.ipi_minero.total.sa',
      'tendencia-ciclo': 'actividad.ipi_minero.total.tc',
    },
  })),
  // ---------------- IPI manufacturero por bloques (divisiones CLaNAE 2004)
  // Serie original: "Cuadro 2"; desestacionalizada: "Cuadro 5" (la API publica SA para los 16 bloques).
  // Verificado con data:check (2026-11-04): 1 fila por período y serie.
  ...IPI_BLOQUES.flatMap(([codigo, slug, name, short]): SeriesDef[] =>
    (
      [
        ['orig', 'original', 'Serie original'],
        ['sa', 'desestacionalizada', 'Serie desestacionalizada'],
      ] as const
    ).map(([suf, sa, serie]) => ({
      id: `actividad.ipi_manuf.${slug}.${suf}`,
      topic: 'actividad',
      family: 'ipi_manuf_bloques',
      name: `IPI manufacturero — ${name} (${codigo}), ${serie.toLowerCase()}`,
      shortName: `${short}${suf === 'sa' ? ' (desest.)' : ''}`,
      frequency: 'M',
      measure: 'index',
      unit: 'Índice base 2004=100',
      base: '2004=100',
      seasonalAdjustment: sa,
      geography: 'Total país',
      priority: 2,
      status: 'verificado',
      source: {
        kind: 'api',
        dataset: 'ipi_manufacturero',
        selector: { codigo_CLaNAE_2004: codigo, serie, tipo_de_indicador: 'Índice' },
      },
      seasonalVariants: {
        original: `actividad.ipi_manuf.${slug}.orig`,
        desestacionalizada: `actividad.ipi_manuf.${slug}.sa`,
      },
      notes: [
        `Bloque CLaNAE 2004 "${codigo}". La desestacionalizada se re-estima con cada publicación: los valores históricos cambian.`,
      ],
    })),
  ),
];

/**
 * Indicadores solicitados que NO están en la API de INDEC (verificado contra el OpenAPI
 * y el catálogo, 2026-11-04). Se documentan en docs/cobertura.md; no generan series.
 */
export const ACTIVIDAD_NO_DISPONIBLE = [
  'ISAC — Indicador sintético de la actividad de la construcción',
  'Utilización de la capacidad instalada en la industria',
];
