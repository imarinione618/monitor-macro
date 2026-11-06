/**
 * Cuentas nacionales (INDEC, base 2004) y encuestas de comercio interno (INDEC),
 * leídas de los CSV de distribución de datos.gob.ar (ver src/core/feeds.ts). Solo dashboard.
 *
 * Los niveles trimestrales del PIB y sus componentes están ANUALIZADOS (el anual es el
 * promedio de los 4 trimestres, no la suma): no se suman trimestres.
 */
import type { SeriesDef } from '../types';

type Ext = { feed: string; key: string; apiId?: string; scaleFactor?: number; zeroAsNullBefore?: string };
const ext = (e: Ext) => ({ kind: 'external' as const, ...e });

const ANUALIZADO = 'Nivel trimestral anualizado publicado por INDEC: el valor anual es el promedio de los cuatro trimestres; no sumar trimestres.';
const qBase = { topic: 'actividad', frequency: 'Q', geography: 'Total país', priority: 1, status: 'verificado' } as const;

// ---------------------------------------------------------------- PIB
const PIB: SeriesDef[] = [
  { ...qBase, id: 'actividad.pib.total.orig', family: 'pib', name: 'PIB a precios constantes — serie original', shortName: 'PIB (original)', measure: 'index', unit: 'Millones de $ de 2004 (anualizado)', seasonalAdjustment: 'original',
    source: ext({ feed: 'sspm.oyd_constantes', key: 'oferta_global_pib', apiId: '4.2_OGP_2004_T_17' }), notes: [ANUALIZADO], seasonalVariants: { original: 'actividad.pib.total.orig', desestacionalizada: 'actividad.pib.total.sa' } },
  { ...qBase, id: 'actividad.pib.total.sa', family: 'pib', name: 'PIB a precios constantes — desestacionalizado', shortName: 'PIB (desest.)', measure: 'index', unit: 'Millones de $ de 2004 (anualizado)', seasonalAdjustment: 'desestacionalizada',
    source: ext({ feed: 'sspm.oyd_desest', key: 'oferta_global_pib', apiId: '3.2_OGP_D_2004_T_17' }), notes: [ANUALIZADO, 'La serie desestacionalizada se re-estima completa con cada publicación.'], seasonalVariants: { original: 'actividad.pib.total.orig', desestacionalizada: 'actividad.pib.total.sa' } },
  { ...qBase, id: 'actividad.pib.corriente', family: 'pib_nominal', name: 'PIB a precios corrientes', shortName: 'PIB nominal', measure: 'index', unit: 'Millones de $ corrientes (anualizado)', seasonalAdjustment: 'original',
    source: ext({ feed: 'sspm.oyd_corrientes', key: 'oferta_global_pib', apiId: '4.4_OGP_2004_T_17' }), notes: [ANUALIZADO, 'Valores nominales: no es volumen.'] },
  { ...qBase, id: 'actividad.pib.deflactor', family: 'pib_nominal', name: 'Índice de precios implícitos del PIB', shortName: 'Deflactor del PIB', measure: 'index', unit: 'Índice 2004=100', base: '2004=100', seasonalAdjustment: 'original',
    source: ext({ feed: 'sspm.oyd_deflactores', key: 'oferta_global_pib', apiId: '25.2_OGP_2004_T_17' }) },
];

// ---------------------------------------------------------------- Oferta y demanda globales
/** [slug, nombre, nombre corto, columna constantes (4.2), columna corrientes (4.4), columna desest (3.2) | null, medida] */
const OYD = [
  ['consumo_privado', 'Consumo privado', 'Consumo privado', 'manda_global_consumo_priv', 'demanda_global_consumo_priv', 'demanda_global_consumo_priv', 'index'],
  ['consumo_publico', 'Consumo público', 'Consumo público', 'demanda_global_consumo_publico', 'demanda_global_consumo_publico', 'demanda_global_consumo_publico', 'index'],
  ['inversion', 'Formación bruta de capital fijo (inversión)', 'Inversión (IBIF)', 'demanda_global_ibif_total', 'demanda_global_ibif', 'demanda_global_ibif', 'index'],
  ['inversion_construccion', 'Inversión en construcción', 'IBIF construcción', 'demanda_global_ibif_construccion', 'demanda_global_ibif_construccion', null, 'index'],
  ['inversion_equipo', 'Inversión en equipo durable de producción', 'IBIF equipo durable', 'demanda_global_ibif_equipo_durable_produccion', 'demanda_global_ibif_equipo_durable_produccion', null, 'index'],
  ['exportaciones', 'Exportaciones de bienes y servicios', 'Exportaciones', 'demanda_global_exportacion', 'demanda_global_exportacion', 'demanda_global_exportacion', 'index'],
  ['importaciones', 'Importaciones de bienes y servicios', 'Importaciones', 'oferta_global_importacion', 'oferta_global_importacion', 'oferta_global_importacion', 'index'],
  ['variacion_existencias', 'Variación de existencias', 'Var. de existencias', 'variacion_existencias', 'variacion_existencias', null, 'balance'],
  ['discrepancia', 'Discrepancia estadística', 'Discrepancia estadística', 'discrepancia_estadistica', 'discrepancia_estadistica', null, 'balance'],
] as const;

const OYD_SERIES: SeriesDef[] = OYD.flatMap(([slug, name, short, colK, colC, colSA, measure]) => {
  const notes = [ANUALIZADO, ...(slug === 'discrepancia' ? ['Se publica por separado desde 2024-T1; antes está incluida en la variación de existencias. Los ceros previos de la fuente se guardan como faltantes.'] : [])];
  const zero = slug === 'discrepancia' ? { zeroAsNullBefore: '2024-Q1' } : {};
  const variants = colSA ? { seasonalVariants: { original: `actividad.oyd.${slug}.orig`, desestacionalizada: `actividad.oyd.${slug}.sa` } } : {};
  const out: SeriesDef[] = [
    { ...qBase, id: `actividad.oyd.${slug}.orig`, family: 'oyd', name: `${name} — precios de 2004`, shortName: short, measure, unit: 'Millones de $ de 2004 (anualizado)', seasonalAdjustment: 'original', source: ext({ feed: 'sspm.oyd_constantes', key: colK, ...zero }), notes, ...variants },
    { ...qBase, id: `actividad.oyd_corriente.${slug}`, family: 'oyd_corriente', name: `${name} — precios corrientes`, shortName: `${short} (corriente)`, measure, unit: 'Millones de $ corrientes (anualizado)', seasonalAdjustment: 'original', source: ext({ feed: 'sspm.oyd_corrientes', key: colC, ...zero }), notes: [...notes, 'Valores nominales: no es volumen.'] },
  ];
  if (colSA) out.push({ ...qBase, id: `actividad.oyd.${slug}.sa`, family: 'oyd_sa', name: `${name} — precios de 2004, desestacionalizado`, shortName: `${short} (desest.)`, measure, unit: 'Millones de $ de 2004 (anualizado)', seasonalAdjustment: 'desestacionalizada', source: ext({ feed: 'sspm.oyd_desest', key: colSA }), notes, ...variants });
  return out;
});

// ---------------------------------------------------------------- VAB por sector (letras CIIU)
const VAB = [
  ['A', 'agro', 'agricultura_ganaderia_caza_silvicultura', 'Agricultura, ganadería, caza y silvicultura', 'Agro'],
  ['B', 'pesca', 'pesca', 'Pesca', 'Pesca'],
  ['C', 'mineria', 'explotacion_minas_canteras', 'Explotación de minas y canteras', 'Minería'],
  ['D', 'industria', 'industria_manufacturera', 'Industria manufacturera', 'Industria'],
  ['E', 'egas', 'suministro_electricidad_gas_agua', 'Electricidad, gas y agua', 'Electricidad, gas y agua'],
  ['F', 'construccion', 'construccion', 'Construcción', 'Construcción'],
  ['G', 'comercio', 'comercio_mayorista_minorista_reparaciones', 'Comercio mayorista, minorista y reparaciones', 'Comercio'],
  ['H', 'hoteles_restaurantes', 'hoteles_restaurantes', 'Hoteles y restaurantes', 'Hoteles y restaurantes'],
  ['I', 'transporte', 'transporte_almacenamiento_comunicaciones', 'Transporte, almacenamiento y comunicaciones', 'Transporte y comunicaciones'],
  ['J', 'financiero', 'intermediacion_financiera', 'Intermediación financiera', 'Intermediación financiera'],
  ['K', 'inmobiliarias', 'actividades_inmobiliarias_empresariales_alquiler', 'Actividades inmobiliarias, empresariales y de alquiler', 'Inmobiliarias y empresariales'],
  ['L', 'adm_publica', 'admin_publica_planes_seguridad_social_afiliacion_obligatoria', 'Administración pública y defensa; seguridad social obligatoria', 'Administración pública'],
  ['M', 'ensenanza', 'ensenianza', 'Enseñanza', 'Enseñanza'],
  ['N', 'salud', 'servicios_sociales_salud', 'Servicios sociales y de salud', 'Salud'],
  ['O', 'otros_servicios', 'otras_actividades_servicios_comunitarias_sociales_personales', 'Otras actividades de servicios comunitarios, sociales y personales', 'Otros servicios'],
  ['P', 'hogares', 'hogares_privs_servicio_domestico', 'Hogares privados con servicio doméstico', 'Servicio doméstico'],
  ['', 'bienes', 'sectores_productores_bienes', 'Sectores productores de bienes', 'Bienes'],
  ['', 'servicios', 'sectores_productores_servicios', 'Sectores productores de servicios', 'Servicios'],
  ['', 'vab_total', 'valor_agregado_bruto_precios_basicos', 'Valor agregado bruto a precios básicos', 'VAB total'],
  ['', 'impuestos_netos', 'impuestos_productos_netos_subsidios', 'Impuestos netos de subsidios a los productos', 'Impuestos netos'],
] as const;

const VAB_SERIES: SeriesDef[] = VAB.flatMap(([letter, slug, col, name, short]) => {
  const label = letter ? `${letter} — ${name}` : name;
  return [
    { ...qBase, id: `actividad.vab.${slug}`, family: 'vab', name: `VAB ${label} — precios de 2004`, shortName: short, measure: 'index' as const, unit: 'Millones de $ de 2004 (anualizado)', seasonalAdjustment: 'original' as const, source: ext({ feed: 'sspm.vab_constantes', key: col }), notes: [ANUALIZADO] },
    { ...qBase, id: `actividad.vab_corriente.${slug}`, family: 'vab_corriente', name: `VAB ${label} — precios corrientes`, shortName: `${short} (corriente)`, measure: 'index' as const, unit: 'Millones de $ corrientes (anualizado)', seasonalAdjustment: 'original' as const, source: ext({ feed: 'sspm.vab_corrientes', key: col }), notes: [ANUALIZADO, 'Valores nominales: no es volumen.'] },
  ];
});

// ---------------------------------------------------------------- Consumo: encuestas de comercio
const mBase = { topic: 'actividad', frequency: 'M', geography: 'Total país', priority: 1, status: 'verificado' } as const;
/** [slug, nombre, feed, col corrientes, col constantes, col índice original, col desest, col tendencia, escala corrientes/constantes] */
const COMERCIO = [
  ['supermercados', 'Supermercados', 'sspm.supermercados', 'ventas_precios_corrientes', 'ventas_precios_constantes', 'ventas_precios_constantes_original', 'ventas_precios_constantes_desestacionalizada', 'ventas_precios_constantes_tendencia_ciclo'],
  ['mayoristas', 'Autoservicios mayoristas', 'sspm.mayoristas', 'ventas_precios_corrientes', 'ventas_precios_constantes', 'ventas_precios_constantes_original', 'ventas_precios_constantes_desestacionalizada', 'ventas_precios_constantes_tendencia_ciclo'],
  ['shoppings', 'Centros de compras (shoppings)', 'sspm.shoppings', 'ventas_totales_precios_corrientes', 'ventas_totales_precios_constantes', 'ventas_totales_precios_constantes_original', 'ventas_totales_precios_constantes_desestacionalizada', 'ventas_totales_precios_constantes_tendencia_ciclo'],
] as const;

const COMERCIO_SERIES: SeriesDef[] = COMERCIO.flatMap(([slug, name, feed, cur, cons, orig, sa, tc]) => {
  const variants = { original: `actividad.consumo.${slug}.orig`, desestacionalizada: `actividad.consumo.${slug}.sa`, 'tendencia-ciclo': `actividad.consumo.${slug}.tc` } as const;
  const unitNote = slug === 'shoppings' ? ['La metadata de datos.gob.ar dice «miles de pesos», pero los valores están en millones de pesos (verificado contra la suma de rubros en pesos).'] : [];
  const idx = (adj: 'original' | 'desestacionalizada' | 'tendencia-ciclo', key: string, suf: string): SeriesDef => ({
    ...mBase, id: `actividad.consumo.${slug}.${suf}`, family: 'consumo', name: `${name} — ventas a precios constantes${adj === 'original' ? '' : adj === 'desestacionalizada' ? ', desestacionalizada' : ', tendencia-ciclo'}`, shortName: name,
    measure: 'index', unit: 'Índice base 2017=100', base: '2017=100', seasonalAdjustment: adj, source: ext({ feed, key }), seasonalVariants: variants,
    notes: ['Índice de ventas a precios constantes (aproximación de volumen).'],
  });
  return [
    idx('original', orig, 'orig'), idx('desestacionalizada', sa, 'sa'), idx('tendencia-ciclo', tc, 'tc'),
    { ...mBase, id: `actividad.consumo_nominal.${slug}`, family: 'consumo_nominal', name: `${name} — ventas a precios corrientes`, shortName: `${name} (corrientes)`, measure: 'flow', unit: 'Millones de $ corrientes', seasonalAdjustment: 'original', source: ext({ feed, key: cur }), notes: ['Ventas nominales: no son volumen.', ...unitNote] },
    { ...mBase, id: `actividad.consumo_constante.${slug}`, family: 'consumo_constante', name: `${name} — ventas a precios constantes`, shortName: `${name} (constantes)`, measure: 'flow', unit: 'Millones de $ de 2017', seasonalAdjustment: 'original', source: ext({ feed, key: cons }), notes: unitNote },
  ];
});

export const CUENTAS: SeriesDef[] = [...PIB, ...OYD_SERIES, ...VAB_SERIES, ...COMERCIO_SERIES];
