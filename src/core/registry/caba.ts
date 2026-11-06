/**
 * Ciudad de Buenos Aires — IDECBA (Instituto de Estadística y Censos de la Ciudad), archivos XLSX
 * resueltos por slug (src/external/idecba.ts). Solo dashboard.
 */
import type { SeriesDef } from '../types';

const ext = (feed: string, key: string) => ({ kind: 'external' as const, feed, key });
const IPCBA_NOTES = [
  'IPCBA: alcance Ciudad de Buenos Aires; no es comparable con el IPC nacional del INDEC.',
  'Divisiones según COICOP 2018 (13 divisiones): no se corresponden 1:1 con las 12 del IPC INDEC. «Resto IPCBA» no equivale exactamente al núcleo del INDEC.',
];

/** [key, nombre, nombre corto, familia] */
const IPCBA = [
  ['nivel_general', 'IPCBA — Nivel general', 'IPCBA', 'ipcba'],
  ['bienes', 'IPCBA — Bienes', 'Bienes', 'ipcba_bs'],
  ['servicios', 'IPCBA — Servicios', 'Servicios', 'ipcba_bs'],
  ['estacionales', 'IPCBA — Estacionales', 'Estacionales', 'ipcba_categorias'],
  ['regulados', 'IPCBA — Regulados', 'Regulados', 'ipcba_categorias'],
  ['resto_ipcba', 'IPCBA — Resto IPCBA', 'Resto IPCBA', 'ipcba_categorias'],
  ['alimentos_bebidas_no_alcoholicas', 'IPCBA — Alimentos y bebidas no alcohólicas', 'Alimentos y bebidas', 'ipcba_divisiones'],
  ['bebidas_alcoholicas_tabaco', 'IPCBA — Bebidas alcohólicas y tabaco', 'Bebidas alc. y tabaco', 'ipcba_divisiones'],
  ['prendas_vestir_calzado', 'IPCBA — Prendas de vestir y calzado', 'Prendas y calzado', 'ipcba_divisiones'],
  ['vivienda_agua_electricidad_gas', 'IPCBA — Vivienda, agua, electricidad, gas y otros combustibles', 'Vivienda y servicios', 'ipcba_divisiones'],
  ['equipamiento_mantenimiento_hogar', 'IPCBA — Equipamiento y mantenimiento del hogar', 'Equipamiento del hogar', 'ipcba_divisiones'],
  ['salud', 'IPCBA — Salud', 'Salud', 'ipcba_divisiones'],
  ['transporte', 'IPCBA — Transporte', 'Transporte', 'ipcba_divisiones'],
  ['informacion_comunicacion', 'IPCBA — Información y comunicación', 'Información y comunicación', 'ipcba_divisiones'],
  ['recreacion_cultura', 'IPCBA — Recreación y cultura', 'Recreación y cultura', 'ipcba_divisiones'],
  ['educacion', 'IPCBA — Educación', 'Educación', 'ipcba_divisiones'],
  ['restaurantes_hoteles', 'IPCBA — Restaurantes y hoteles', 'Restaurantes y hoteles', 'ipcba_divisiones'],
  ['seguros_servicios_financieros', 'IPCBA — Seguros y servicios financieros', 'Seguros y serv. financieros', 'ipcba_divisiones'],
  ['cuidado_personal_proteccion_social', 'IPCBA — Cuidado personal, protección social y otros', 'Cuidado personal y otros', 'ipcba_divisiones'],
  ['servicios_alimentos_bebidas_fuera_hogar', 'IPCBA — Servicios de alimentos y bebidas fuera del hogar', 'Comidas fuera del hogar', 'ipcba_divisiones'],
] as const;

export const CABA: SeriesDef[] = [
  ...IPCBA.map(([key, name, shortName, family]): SeriesDef => ({
    id: `precios.ipcba.${key}`, topic: 'precios', family, name, shortName, frequency: 'M', measure: 'index',
    unit: 'Índice base 2021=100', base: '2021=100', seasonalAdjustment: 'original', geography: 'Ciudad de Buenos Aires',
    source: ext('idecba.ipcba', key), status: 'verificado', priority: 1,
    notes: key === 'nivel_general' ? [...IPCBA_NOTES, 'Antes de febrero de 2022 el nivel general proviene del empalme del IDECBA con la base anterior (jul-2011/jun-2012).'] : IPCBA_NOTES,
  })),
  {
    id: 'actividad.caba.restaurantes', topic: 'actividad', family: 'caba_restaurantes', name: 'Actividad en restaurantes tradicionales — Ciudad de Buenos Aires', shortName: 'Restaurantes CABA',
    frequency: 'M', measure: 'index', unit: 'Índice base marzo 2015=100', base: 'mar-2015=100', seasonalAdjustment: 'original', geography: 'Ciudad de Buenos Aires',
    source: ext('idecba.restaurantes', 'indice_actividad'), status: 'verificado', priority: 1,
    notes: [
      'Índice de volumen físico: cubiertos vendidos en una semana de referencia (encuesta EREST, IDECBA). No es facturación.',
      'Solo restaurantes tradicionales de la Ciudad; excluye bares. Serie sin desestacionalizar: comparar en forma interanual.',
      'Sin dato de abril a octubre de 2020 (cierre por ASPO). Los últimos meses son provisorios.',
    ],
  },
];
