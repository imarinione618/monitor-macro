/**
 * Definiciones de las series de precios de combustibles (sin dependencias de Node).
 *
 * Fuentes (Secretaría de Energía, portal CKAN datos.energia.gob.ar, licencia CC-BY-4.0):
 *  - Res. 314/2016 «Precios en surtidor»: cada estación declara su precio vigente al cambiarlo.
 *  - Res. 1104/04 «Precios y volúmenes EESS»: declaración jurada mensual por estación (incluye YPF).
 */
import type { FuelDef, FuelProduct, FuelScope } from './types';

export const SURTIDOR_DATASET_URL = 'http://datos.energia.gob.ar/dataset/precios-en-surtidor';
export const SURTIDOR_VIGENTES_URL = 'http://datos.energia.gob.ar/dataset/1c181390-5045-475e-94dc-410429be4b17/resource/80ac25de-a44a-4445-9215-090cf55cfda5/download/precios-en-surtidor-resolucin-3142016.csv';
export const SURTIDOR_HISTORICO_URL = 'http://datos.energia.gob.ar/dataset/1c181390-5045-475e-94dc-410429be4b17/resource/f8dda0d5-2a9f-4d34-b79b-4e63de3995df/download/precios-historicos.csv';

export const EESS_PACKAGE_ID = 'precios-eess---resolucion-1104-04';
export const EESS_DATASET_URL = `http://datos.energia.gob.ar/dataset/${EESS_PACKAGE_ID}`;
export const EESS_PACKAGE_URL = `http://datos.energia.gob.ar/api/3/action/package_show?id=${EESS_PACKAGE_ID}`;
/** Recurso «Precios EESS desde Diciembre2024» (se actualiza mensualmente). */
export const EESS_VIGENTE_RESOURCE_ID = '3cbdd364-a12c-46b7-b791-dd8e8bcfb32d';
export const EESS_VIGENTE_URL = 'http://datos.energia.gob.ar/dataset/708f9ab4-829b-4f02-b507-f303c5bc4800/resource/3cbdd364-a12c-46b7-b791-dd8e8bcfb32d/download/precios-eess-2025-.csv';
/** Primer año de archivos anuales con columnas y productos consistentes con el resto de la serie. */
export const EESS_FIRST_YEAR = 2016;

/** Primer día calculado de la serie diaria. */
export const SURTIDOR_FIRST_DAY = '2018-01-01';
/** Fechas de vigencia anteriores se descartan como basura (la Res. 314 rige desde 2016). */
export const SURTIDOR_MIN_VALID_DAY = '2016-01-01';
/** Una estación sale de la muestra si su último precio declarado tiene más de estos días. */
export const SURTIDOR_MAX_AGE_DAYS = 90;
/** Banda de outliers: ± esta fracción alrededor de la mediana nacional del día/producto (o del mes/producto). */
export const OUTLIER_BAND = 0.5;
/**
 * Registros mensuales con volumen mayor a este múltiplo de la mediana nacional del mes/producto se
 * descartan: son errores de unidad (litros declarados como m³, ×1000) que dominarían la ponderación.
 */
export const VOLUME_OUTLIER_FACTOR = 50;
/** Mínimo de estaciones (diaria) o registros (mensual) para publicar un valor; si no, null. */
export const MIN_SAMPLE = 3;
/** Ventana que se recalcula en cada corrida diaria (absorbe cargas tardías del publicador). */
export const SURTIDOR_RECOMPUTE_DAYS = 35;
/** Días de eventos que conserva el estado persistido (más el último evento previo de cada estación). */
export const SURTIDOR_STATE_RETENTION_DAYS = 180;
/** Reconciliación con el histórico completo y descarga del archivo vigente 1104. */
export const RECONCILE_EVERY_DAYS = 7;

export const PRODUCTS: FuelProduct[] = ['super', 'premium', 'gasoil_g2', 'gasoil_g3'];
export const SCOPES: FuelScope[] = ['nacional', 'caba'];

/** idproducto de la Res. 314 y nombre exacto publicado (se valida en cada lectura). */
export const SURTIDOR_PRODUCT_IDS: Record<string, { product: FuelProduct; name: string }> = {
  '2': { product: 'super', name: 'Nafta (súper) entre 92 y 95 Ron' },
  '3': { product: 'premium', name: 'Nafta (premium) de más de 95 Ron' },
  '19': { product: 'gasoil_g2', name: 'Gas Oil Grado 2' },
  '21': { product: 'gasoil_g3', name: 'Gas Oil Grado 3' },
};
/** Horario diurno (idtipohorario = 2). */
export const SURTIDOR_HORARIO_ID = '2';
export const SURTIDOR_HORARIO_NAME = 'Diurno';

/** Valores exactos de `producto` en la Res. 1104 (los demás —GNC, Gas Oil Grado 2B, común, kerosene— se ignoran). */
export const EESS_PRODUCT_NAMES: Record<string, FuelProduct> = {
  'Nafta (súper) entre 92 y 95 Ron': 'super',
  'Nafta (premium) de más de 95 Ron': 'premium',
  'Gas Oil Grado 2': 'gasoil_g2',
  'Gas Oil Grado 3': 'gasoil_g3',
};
export const EESS_CHANNEL = 'Al público';
export const CABA_PROVINCE = 'CAPITAL FEDERAL';

export const PRODUCT_LABEL: Record<FuelProduct, { long: string; short: string }> = {
  super: { long: 'Nafta súper (92–95 RON)', short: 'Súper' },
  premium: { long: 'Nafta premium (más de 95 RON)', short: 'Premium' },
  gasoil_g2: { long: 'Gasoil grado 2', short: 'Gasoil G2' },
  gasoil_g3: { long: 'Gasoil grado 3 (premium)', short: 'Gasoil G3' },
};
export const SCOPE_LABEL: Record<FuelScope, { long: string; short: string }> = {
  nacional: { long: 'total país', short: 'País' },
  caba: { long: 'Ciudad de Buenos Aires', short: 'CABA' },
};

export const YPF_BREAK = { date: '2025-07-01', note: 'Desde julio de 2025 YPF casi no informa precios; la muestra pierde ~1.500 estaciones y el nivel sube por composición.' };

export const surtidorId = (product: FuelProduct, scope: FuelScope) => `combustibles.surtidor.${product}.${scope}`;
export const eessId = (product: FuelProduct, scope: FuelScope) => `combustibles.eess.${product}.${scope}`;

const SURTIDOR_METHOD = `Mediana diaria del precio en surtidor (horario diurno) entre estaciones. Para cada día se toma, por estación, el último precio declarado con fecha de vigencia hasta el cierre del día (precio vigente, sin interpolar). Se excluye la estación si ese precio tiene más de ${SURTIDOR_MAX_AGE_DAYS} días, si es ≤ 0 o si cae fuera de ±${OUTLIER_BAND * 100}% de la mediana nacional del día para el producto. n = estaciones usadas; con menos de ${MIN_SAMPLE}, el valor es null.`;
const EESS_METHOD = `Promedio mensual del precio de surtidor ponderado por volumen vendido, canal «${EESS_CHANNEL}», sobre las declaraciones juradas de cada estación. Se excluyen registros sin movimiento, con volumen ≤ 0 o faltante, precio ≤ 0 o faltante, precios fuera de ±${OUTLIER_BAND * 100}% de la mediana nacional del mes para el producto y volúmenes mayores a ${VOLUME_OUTLIER_FACTOR} veces la mediana nacional del mes (errores de unidad). n = registros usados; con menos de ${MIN_SAMPLE}, el valor es null.`;

export const SURTIDOR_DEFS: FuelDef[] = PRODUCTS.flatMap(product => SCOPES.map((scope): FuelDef => ({
  id: surtidorId(product, scope),
  name: `${PRODUCT_LABEL[product].long}: precio en surtidor, mediana diaria, ${SCOPE_LABEL[scope].long} (Res. 314/2016)`,
  shortName: `${PRODUCT_LABEL[product].short} · ${SCOPE_LABEL[scope].short} (diario)`,
  product, scope, frequency: 'D', unit: 'ARS por litro',
  method: SURTIDOR_METHOD,
  source: 'Secretaría de Energía, Res. 314/2016 (precios en surtidor), datos.energia.gob.ar',
  sourceUrl: SURTIDOR_DATASET_URL,
  breaks: [YPF_BREAK],
})));

export const EESS_DEFS: FuelDef[] = PRODUCTS.flatMap(product => SCOPES.map((scope): FuelDef => ({
  id: eessId(product, scope),
  name: `${PRODUCT_LABEL[product].long}: precio en surtidor promedio ponderado por volumen, canal al público, ${SCOPE_LABEL[scope].long} (Res. 1104/04)`,
  shortName: `${PRODUCT_LABEL[product].short} · ${SCOPE_LABEL[scope].short} (mensual)`,
  product, scope, frequency: 'M', unit: 'ARS por litro',
  method: EESS_METHOD,
  source: 'Secretaría de Energía, Res. 1104/04 (precios y volúmenes de EESS), datos.energia.gob.ar',
  sourceUrl: EESS_DATASET_URL,
})));

export const FUEL_DEFS: FuelDef[] = [...SURTIDOR_DEFS, ...EESS_DEFS];
