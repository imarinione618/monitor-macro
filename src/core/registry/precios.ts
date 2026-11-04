import type { SeriesDef } from '../types';

const IPC_REGIONS = [
  ['Nacional', 'nacional', 'Total nacional'],
  ['GBA', 'gba', 'GBA'],
  ['Pampeana', 'pampeana', 'Región Pampeana'],
  ['Noreste', 'noreste', 'Región Noreste'],
  ['Noroeste', 'noroeste', 'Región Noroeste'],
  ['Cuyo', 'cuyo', 'Región Cuyo'],
  ['Patagonia', 'patagonia', 'Región Patagonia'],
] as const;

const ipcBase = {
  topic: 'precios',
  frequency: 'M',
  measure: 'index',
  unit: 'Índice base dic-2016=100',
  base: 'dic-2016=100',
  seasonalAdjustment: 'original',
  status: 'verificado',
} as const;

const IPC_NOTE = 'IPC base dic-2016=100 (metodología INDEC N.º 32). La variación mensual de la serie original es la medida oficial de inflación.';

const IPC_DIVISIONS = [
  ['01', 'alimentos', 'Alimentos y bebidas no alcohólicas'],
  ['02', 'alcohol_tabaco', 'Bebidas alcohólicas y tabaco'],
  ['03', 'vestimenta', 'Prendas de vestir y calzado'],
  ['04', 'vivienda', 'Vivienda, agua, electricidad, gas y otros combustibles'],
  ['05', 'equipamiento', 'Equipamiento y mantenimiento del hogar'],
  ['06', 'salud', 'Salud'],
  ['07', 'transporte', 'Transporte'],
  ['08', 'comunicacion', 'Comunicación'],
  ['09', 'recreacion', 'Recreación y cultura'],
  ['10', 'educacion', 'Educación'],
  ['11', 'restaurantes', 'Restaurantes y hoteles'],
  ['12', 'otros', 'Bienes y servicios varios'],
] as const;

export const PRECIOS: SeriesDef[] = [
  // ---------------- IPC nivel general por región
  ...IPC_REGIONS.map(
    ([region, slug, geo]): SeriesDef => ({
      ...ipcBase,
      id: `precios.ipc.ng.${slug}`,
      family: 'ipc_nivel_general',
      name: `IPC — Nivel general, ${geo}`,
      shortName: slug === 'nacional' ? 'IPC nacional' : `IPC ${geo.replace('Región ', '')}`,
      geography: geo,
      priority: slug === 'nacional' ? 1 : 2,
      source: { kind: 'api', dataset: 'ipc_nacional', selector: { clasificador: 'IPC', codigo: '0', region, tipo_de_indicador: 'Indice' } },
      notes: [IPC_NOTE],
      headline: slug === 'nacional' ? { order: 1, transform: 'pct_prev', compare: 'pct_yoy' } : undefined,
    }),
  ),
  // Variación mensual publicada (para contraste con la calculada)
  {
    ...ipcBase,
    id: 'precios.ipc.ng.nacional.var_m_pub',
    family: 'ipc_nivel_general',
    name: 'IPC — Nivel general nacional, var. % mensual publicada',
    shortName: 'IPC var. m/m publicada',
    measure: 'published_change',
    unit: '%',
    geography: 'Total nacional',
    priority: 2,
    source: { kind: 'api', dataset: 'ipc_nacional', selector: { clasificador: 'IPC', codigo: '0', region: 'Nacional', tipo_de_indicador: 'v_m' } },
    notes: ['Publicada por el INDEC con 1 decimal. Diferencias con la calculada desde el índice se deben a redondeo.'],
  },
  // ---------------- Categorías: núcleo, regulados, estacionales; bienes y servicios (nacional)
  ...(
    [
      ['Estacional, Núcleo y Regulados', 'N', 'nucleo', 'Núcleo', 1],
      ['Estacional, Núcleo y Regulados', 'R', 'regulados', 'Regulados', 1],
      ['Estacional, Núcleo y Regulados', 'E', 'estacionales', 'Estacionales', 1],
      ['Bienes y servicios', 'B', 'bienes', 'Bienes', 2],
      ['Bienes y servicios', 'S', 'servicios', 'Servicios', 2],
    ] as const
  ).map(
    ([clasificador, codigo, slug, name, priority]): SeriesDef => ({
      ...ipcBase,
      id: `precios.ipc.cat.${slug}.nacional`,
      family: 'ipc_categorias',
      name: `IPC — ${name}, total nacional`,
      shortName: name,
      geography: 'Total nacional',
      priority,
      source: { kind: 'api', dataset: 'ipc_nacional', selector: { clasificador, codigo, region: 'Nacional', tipo_de_indicador: 'Indice' } },
      notes: [IPC_NOTE],
    }),
  ),
  // ---------------- Divisiones COICOP (nacional)
  ...IPC_DIVISIONS.map(
    ([codigo, slug, name]): SeriesDef => ({
      ...ipcBase,
      id: `precios.ipc.div.${slug}.nacional`,
      family: 'ipc_divisiones',
      name: `IPC — ${name}, total nacional`,
      shortName: name,
      geography: 'Total nacional',
      priority: 2,
      source: {
        kind: 'api',
        dataset: 'ipc_nacional',
        selector: { clasificador: 'COICOP Argentina 2019', nivel: 'División', codigo, region: 'Nacional', tipo_de_indicador: 'Indice' },
      },
      notes: [IPC_NOTE, 'Las ponderaciones e incidencias por división no se derivan multiplicando ponderador × variación: usar las incidencias publicadas.'],
    }),
  ),
  // ---------------- Mayoristas (SIPM)
  ...(
    [
      ['IPIM', 'ipim', 'Índice de precios internos al por mayor (IPIM)', 'IPIM', 1],
      ['IPIB', 'ipib', 'Índice de precios internos básicos al por mayor (IPIB)', 'IPIB', 2],
      ['IPP', 'ipp', 'Índice de precios básicos del productor (IPP)', 'IPP', 2],
    ] as const
  ).map(
    ([indicador, slug, name, short, priority]): SeriesDef => ({
      ...ipcBase,
      id: `precios.sipm.${slug}.ng`,
      family: 'mayoristas',
      name: `${name} — Nivel general`,
      shortName: short,
      unit: 'Índice base 1993=100 (reexpresado dic-2015=100)',
      base: 'dic-2015=100',
      geography: 'Total país',
      priority,
      source: { kind: 'api', dataset: 'sipm_precios_mayoristas', selector: { indicador, nivel: 'Nivel general', tipo_de_indicador: 'Indice' } },
      notes: ['SIPM base 1993 (metodología INDEC N.º 8). La API publica el nivel reexpresado con dic-2015=100.'],
      headline: slug === 'ipim' ? { order: 8, transform: 'pct_prev', compare: 'pct_yoy' } : undefined,
    }),
  ),
  // ---------------- IPIM por origen y por sector (verificado con data:check, 2026-11-04)
  // En la API, "Primarios" es nivel "Sector" del clasificador "SIPM 93" (código 1) y
  // "Manufacturados y energía eléctrica" es nivel "Sector" del clasificador "CIIU3" (código 2).
  // El sector "Productos importados" (SIPM 93, código 3) coincide con el origen importado y no se duplica.
  ...(
    [
      ['SIPM 93', 'Origen', 'N', 'nacional', 'Productos nacionales', 'IPIM nacionales'],
      ['SIPM 93', 'Origen', 'I', 'importado', 'Productos importados', 'IPIM importados'],
      ['SIPM 93', 'Sector', '1', 'primarios', 'Productos primarios (nacionales)', 'IPIM primarios'],
      ['CIIU3', 'Sector', '2', 'manuf_energia', 'Productos manufacturados y energía eléctrica (nacionales)', 'IPIM manufact. y energía'],
    ] as const
  ).map(
    ([clasificador, nivel, codigo_apertura, slug, name, short]): SeriesDef => ({
      ...ipcBase,
      id: `precios.sipm.ipim.${slug}`,
      family: 'mayoristas_aperturas',
      name: `IPIM — ${name}`,
      shortName: short,
      unit: 'Índice base 1993=100 (reexpresado dic-2015=100)',
      base: 'dic-2015=100',
      geography: 'Total país',
      priority: 2,
      source: {
        kind: 'api',
        dataset: 'sipm_precios_mayoristas',
        selector: { indicador: 'IPIM', clasificador, nivel, codigo_apertura, tipo_de_indicador: 'Indice' },
      },
      notes: ['SIPM base 1993 (metodología INDEC N.º 8). La API publica el nivel reexpresado con dic-2015=100.'],
    }),
  ),
  // ---------------- Costo de la construcción
  ...(
    [
      ['0', 'ng', 'Nivel general', 'ICC', 1],
      ['01', 'materiales', 'Materiales', 'ICC materiales', 2],
      ['02', 'mano_obra', 'Mano de obra', 'ICC mano de obra', 2],
      ['03', 'gastos_generales', 'Gastos generales', 'ICC gastos generales', 2],
    ] as const
  ).map(
    ([codigo_apertura, slug, name, short, priority]): SeriesDef => ({
      ...ipcBase,
      id: `precios.icc.${slug}`,
      family: 'icc',
      name: `Índice del costo de la construcción (GBA) — ${name}`,
      shortName: short,
      unit: 'Índice (base 1993; según API "nivel del período, base 1993, ene-22=100")',
      base: 'ver unidad',
      geography: 'Gran Buenos Aires',
      priority,
      source: { kind: 'api', dataset: 'icc_precios_construccion', selector: { codigo_apertura, clasificador: 'ICC 93', tipo_de_indicador: 'Indice' } },
      notes: ['ICC en el Gran Buenos Aires (metodología INDEC N.º 9). Cobertura geográfica: GBA, no total país.'],
    }),
  ),
  // ---------------- Canastas básicas (GBA, pesos corrientes)
  ...(
    [
      ['CBA', 'CBA', 'cba_adulto', 'Canasta básica alimentaria — adulto equivalente', 'CBA (adulto eq.)', 1],
      ['CBT', 'CBT', 'cbt_adulto', 'Canasta básica total — adulto equivalente', 'CBT (adulto eq.)', 1],
      ['CBT H2', 'Hogar 2', 'cbt_hogar2', 'Canasta básica total — Hogar 2 (4 integrantes)', 'CBT hogar tipo 2', 2],
      ['CBA H2', 'Hogar 2', 'cba_hogar2', 'Canasta básica alimentaria — Hogar 2 (4 integrantes)', 'CBA hogar tipo 2', 2],
    ] as const
  ).map(
    ([codigo, tipo, slug, name, short, priority]): SeriesDef => ({
      id: `precios.canastas.${slug}`,
      topic: 'precios',
      family: 'canastas',
      name: `${name}, GBA`,
      shortName: short,
      frequency: 'M',
      measure: 'price_level',
      unit: 'Pesos corrientes por mes',
      currency: 'ARS corrientes',
      seasonalAdjustment: 'original',
      geography: 'Gran Buenos Aires',
      priority,
      status: 'verificado',
      source: { kind: 'api', dataset: 'valorizacion_canastas_cba_cbt', selector: { codigo, tipo_de_indicador: tipo } },
      notes: [
        'Valor mensual en pesos corrientes (no es un índice). Hogar 2: varón de 35, mujer de 31, hijo de 6 e hija de 8 años.',
      ],
    }),
  ),
];
