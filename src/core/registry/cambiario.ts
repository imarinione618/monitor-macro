/**
 * Balance cambiario (BCRA), mensual, millones de USD. Fuente: CSV de datos.gob.ar (catálogo SSPM):
 *  - 182.1 Balance cambiario (cuenta corriente, cuenta capital y financiera, reservas).
 *  - 184.1 Cobros y pagos por bienes por sector.
 *  - 185.1 Cobros y pagos por tipo de servicio.
 * Signos publicados: positivo = ingreso neto de divisas; negativo = egreso neto. Solo dashboard.
 *
 * Identidades verificadas con el CSV (2026-11-17):
 *   cuenta corriente + cuenta capital y financiera + concepto no informado = variación de reservas por transacciones;
 *   variación por transacciones + ajuste por tipo de pase y valuación = variación contable de reservas;
 *   bienes + servicios + ingreso primario + ingreso secundario = cuenta corriente cambiaria.
 */
import type { Measure, Period, SeriesDef } from '../types';

const base = {
  topic: 'cambiario', frequency: 'M', geography: 'Total país', seasonalAdjustment: 'original', status: 'verificado', currency: 'USD corrientes',
} as const;
const UNIT = 'Millones de USD';
const NOTE = 'Balance cambiario del BCRA: operaciones cursadas en el mercado de cambios y movimientos de reservas (base caja). No equivale a la balanza de pagos del INDEC.';
const SIGN = 'Signo publicado: positivo = ingreso neto de divisas; negativo = egreso neto.';

type Row = { id: string; key: string; name: string; short: string; family: string; measure: Measure; notes?: string[]; zeroAsNullBefore?: Period; priority?: 1 | 2 };

const def = (feed: string) => (r: Row): SeriesDef => ({
  ...base,
  id: `cambiario.${r.id}`,
  family: r.family,
  name: r.name,
  shortName: r.short,
  measure: r.measure,
  unit: UNIT,
  priority: r.priority ?? 1,
  source: { kind: 'external', feed, key: r.key, ...(r.zeroAsNullBefore ? { zeroAsNullBefore: r.zeroAsNullBefore } : {}) },
  notes: [NOTE, ...(r.measure === 'balance' ? [SIGN] : []), ...(r.notes ?? [])],
});

const net = (id: string, key: string, name: string, short: string, family: string, extra: Partial<Row> = {}): Row => ({ id, key, name, short, family, measure: 'balance', ...extra });
const gross = (id: string, key: string, name: string, short: string, family: string, extra: Partial<Row> = {}): Row => ({ id, key, name, short, family, measure: 'flow', ...extra });

// ---------------------------------------------------------------- 182.1 Balance cambiario
const BALANCE: Row[] = [
  // Resultado: sus tres componentes suman la variación de reservas por transacciones.
  net('resultado.cuenta_corriente', 'total_cuenta_corriente_cambiaria', 'Cuenta corriente cambiaria', 'Cuenta corriente', 'bc_resultado'),
  net('resultado.capital_financiera', 'total_cuenta_capital_financiera_cambiaria', 'Cuenta capital y financiera cambiaria', 'Cuenta capital y financiera', 'bc_resultado'),
  net('resultado.no_informado', 'concepto_no_informado_cliente_neto', 'Concepto no informado por el cliente (neto)', 'Concepto no informado', 'bc_resultado', {
    zeroAsNullBefore: '2017-07', notes: ['Concepto vigente desde julio de 2017; antes no existe (vacío).'],
  }),
  // Reservas
  net('reservas.transacciones', 'variacion_reservas_internacionales_transacciones', 'Variación de reservas internacionales por transacciones', 'Var. de reservas por transacciones', 'bc_reservas'),
  net('reservas.ajuste', 'ajuste_reservas_internac_tipo_pase_valuacion', 'Ajuste de reservas por tipo de pase y valuación', 'Ajuste por pase y valuación', 'bc_reservas'),
  net('reservas.contable', 'variacion_contable_reservas_internacionales', 'Variación contable de reservas internacionales', 'Var. contable de reservas', 'bc_reservas'),
  // Cuenta corriente por componente (suman la cuenta corriente)
  net('cc.bienes', 'cuenta_corriente_cambiaria_total_bienes', 'Cuenta corriente cambiaria: bienes (neto)', 'Bienes', 'bc_cc'),
  net('cc.servicios', 'cuenta_corriente_cambiaria_total_servicios', 'Cuenta corriente cambiaria: servicios (neto)', 'Servicios', 'bc_cc'),
  net('cc.ingreso_primario', 'cuenta_corriente_cambiaria_total_ingreso_primario', 'Cuenta corriente cambiaria: ingreso primario (neto)', 'Ingreso primario', 'bc_cc'),
  net('cc.ingreso_secundario', 'cuenta_corriente_cambiaria_total_ingreso_secundario', 'Cuenta corriente cambiaria: ingreso secundario (neto)', 'Ingreso secundario', 'bc_cc'),
  // Ingresos y egresos brutos de la cuenta corriente
  gross('bienes.cobros', 'c_corriente_cobros_expo_bienes', 'Cobros de exportaciones de bienes', 'Cobros de exportaciones', 'bc_cc_brutos'),
  gross('bienes.pagos', 'cuenta_corriente_cambiaria_pagos_importaciones_bienes', 'Pagos de importaciones de bienes', 'Pagos de importaciones', 'bc_cc_brutos'),
  gross('servicios.ingresos', 'cuenta_corriente_cambiaria_ingresos_servicios', 'Servicios: ingresos', 'Servicios: ingresos', 'bc_cc_brutos'),
  gross('servicios.egresos', 'cuenta_corriente_cambiaria_egresos_servicios', 'Servicios: egresos', 'Servicios: egresos', 'bc_cc_brutos'),
  // Ingreso primario
  net('ip.intereses', 'cuenta_corriente_cambiaria_ingreso_primario_total_intereses', 'Ingreso primario: intereses (neto)', 'Intereses (neto)', 'bc_ingreso_primario'),
  net('ip.utilidades', 'c_corr_ingr_prim_total_utilidades_dividendos_otras_rentas', 'Ingreso primario: utilidades, dividendos y otras rentas (neto)', 'Utilidades y dividendos (neto)', 'bc_ingreso_primario'),
  gross('ip.intereses_fmi', 'c_corriente_ingreso_primariopagos_intereses_al_fmi', 'Pagos de intereses al FMI', 'Intereses al FMI', 'bc_ingreso_primario', { priority: 2 }),
  gross('ip.intereses_org_int', 'c_corr_ingr_prim_pag_intereses_otros_org_int', 'Pagos de intereses a otros organismos internacionales y bilaterales', 'Intereses a otros org. int.', 'bc_ingreso_primario', { priority: 2 }),
  gross('ip.intereses_gobierno', 'c_corr_ingr_prim_otros_pagos_intereses_gobierno_nacional', 'Otros pagos de intereses del Gobierno Nacional', 'Otros intereses del Gobierno', 'bc_ingreso_primario', { priority: 2 }),
  gross('ip.intereses_otros', 'c_corriente_ingreso_primariootros_pagos_intereses', 'Otros pagos de intereses', 'Otros pagos de intereses', 'bc_ingreso_primario', { priority: 2 }),
  // Cuenta capital y financiera por concepto (todos suman la cuenta capital y financiera)
  net('cf.fae_spnf', 'c_k_finc_c_finc_total_form_activos_ext_sect_priv_no_finc', 'Formación de activos externos del sector privado no financiero (neto)', 'FAE sector privado no financiero', 'bc_financiera', {
    notes: ['Negativo = compras netas de activos externos (billetes, depósitos y otros activos) por personas humanas y empresas.'],
  }),
  net('cf.inversion_directa', 'c_k_financ_c_financ_total_inv_directa_no_residentes', 'Inversión directa de no residentes (neto)', 'Inversión directa', 'bc_financiera'),
  net('cf.portafolio', 'c_k_finc_c_finc_total_inv_portafolio_no_residentes', 'Inversión de portafolio de no residentes (neto)', 'Inversión de portafolio', 'bc_financiera'),
  net('cf.prestamos', 'c_k_finc_c_finc_total_prest_fincs_tit_deud_lin_cred', 'Préstamos financieros, títulos de deuda y líneas de crédito (neto)', 'Préstamos y títulos de deuda', 'bc_financiera'),
  net('cf.fmi', 'c_cap_financ_cuenta_financ_total_operac_con_fmi', 'Operaciones con el FMI (neto)', 'FMI', 'bc_financiera'),
  net('cf.org_int', 'c_k_finc_c_finc_total_prest_otros_org_int_otros_bilat', 'Préstamos de otros organismos internacionales y bilaterales (neto)', 'Otros org. internacionales', 'bc_financiera'),
  net('cf.sector_publico', 'c_cap_financ_c_financ_otras_operac_sect_publico_neto', 'Otras operaciones del sector público (neto)', 'Otras op. del sector público', 'bc_financiera'),
  net('cf.fae_financiero', 'c_cap_financ_c_financ_form_activos_ext_sect_financ_pgc', 'Formación de activos externos del sector financiero (PGC)', 'FAE sector financiero (PGC)', 'bc_financiera'),
  net('cf.fae_publico', 'c_cap_financ_c_financ_form_activos_ext_sect_publico', 'Formación de activos externos del sector público', 'FAE sector público', 'bc_financiera'),
  net('cf.titulos', 'c_cap_financ_c_financ_compra_venta_titulos_valores', 'Compra-venta de títulos valores', 'Compra-venta de títulos', 'bc_financiera'),
  net('cf.canje', 'c_k_finc_c_finc_operac_canje_transf_con_ext', 'Operaciones de canje por transferencias con el exterior', 'Canje', 'bc_financiera'),
  net('cf.otros', 'c_cap_financ_cuenta_financ_otros_movimientos_netos', 'Otros movimientos netos', 'Otros movimientos', 'bc_financiera'),
  net('cf.cuenta_capital', 'c_cap_financ_cuenta_capital_cambiaria', 'Cuenta de capital cambiaria', 'Cuenta de capital', 'bc_financiera'),
  // FAE del sector privado no financiero: ingresos (ventas) y egresos (compras)
  gross('fae.egresos', 'c_k_finc_c_finc_egres_form_activos_ext_sect_priv_no_finc', 'Formación de activos externos del SPNF: egresos (compras de activos externos)', 'FAE: compras (egresos)', 'bc_fae'),
  gross('fae.ingresos', 'c_k_finc_c_finc_ingres_form_activos_ext_sect_priv_no_finc', 'Formación de activos externos del SPNF: ingresos (ventas de activos externos)', 'FAE: ventas (ingresos)', 'bc_fae'),
];

// ---------------------------------------------------------------- 184.1 Bienes por sector
/** [slug, sufijo de columna (cobros, pagos), nombre] */
const SECTORES: [string, string, string, string][] = [
  ['oleaginosos_cerealeros', 'bienes_cobros_oleaginosos_cerealeros', 'bienes_pagos_oleaginosos_cerealeros', 'Oleaginosos y cerealeros'],
  ['agro', 'bienes_cobros_agric_ganaderia_otras_activid_primarias', 'bienes_pagos_agric_ganaderia_otras_activid_primarias', 'Agricultura, ganadería y otras primarias'],
  ['alimentos', 'bienes_cobros_alimentos_bebidas_tabaco', 'bienes_pagos_alimentos_bebidas_tabaco', 'Alimentos, bebidas y tabaco'],
  ['petroleo', 'bienes_cobros_petroleo', 'bienes_pagos_petroleo', 'Petróleo'],
  ['gas', 'bienes_cobros_gas_extraccion_transporte_distribucion', 'bienes_pagos_gas_extraccion_transporte_distribucion', 'Gas'],
  ['mineria', 'bienes_cobros_mineria', 'bienes_pagos_mineria', 'Minería'],
  ['automotriz', 'bienes_cobros_industria_automotriz', 'bienes_pagos_industria_automotriz', 'Industria automotriz'],
  ['quimica', 'bienes_cobros_industria_quimica_caucho_plastico', 'bienes_pagos_industria_quimica_caucho_plastico', 'Química, caucho y plástico'],
  ['metales', 'bienes_cobros_metales_comunes_elaboracion', 'bienes_pagos_metales_comunes_elaboracion', 'Metales comunes y su elaboración'],
  ['maquinarias', 'bienes_cobros_maquinarias_equipos', 'bienes_pagos_maquinarias_equipos', 'Maquinarias y equipos'],
  ['otras_manufacturas', 'bienes_cobros_otros_industria_manufacturera', 'bienes_pagos_otros_industria_manufacturera', 'Otras industrias manufactureras'],
  ['textil', 'bienes_cobros_industria_textil_curtidos', 'bienes_pagos_industria_textil_curtidos', 'Textil y curtidos'],
  ['papel', 'bienes_cobros_industria_papel_ediciones_impresiones', 'bienes_pagos_industria_papel_ediciones_impresiones', 'Papel, ediciones e impresiones'],
  ['minerales_no_metalicos', 'bienes_cobr_prod_minerales_no_metalicos', 'bienes_pag_prod_minerales_no_metalicos', 'Minerales no metálicos'],
  ['comercio', 'bienes_cobros_comercio', 'bienes_pagos_comercio', 'Comercio'],
  ['electricidad', 'bienes_cobros_electr_generacion_transporte_distribucion', 'bienes_pagos_electr_generacion_transporte_distribucion', 'Electricidad'],
  ['construccion', 'bienes_cobros_construccion', 'bienes_pagos_construccion', 'Construcción'],
  ['transporte', 'bienes_cobros_transporte', 'bienes_pagos_transporte', 'Transporte'],
  ['comunicaciones', 'bienes_cobros_comunicaciones', 'bienes_pagos_comunicaciones', 'Comunicaciones'],
  ['informatica', 'bienes_cobros_informatica', 'bienes_pagos_informatica', 'Informática'],
  ['entidades_financieras', 'bienes_cobros_entidades_financieras_cambiarias', 'bienes_pagos_entidades_financieras_cambiarias', 'Entidades financieras y cambiarias'],
  ['seguros', 'bienes_cobros_seguros', 'bienes_pagos_seguros', 'Seguros'],
  ['turismo', 'bienes_cobros_turismo_hoteleria', 'bienes_pagos_turismo_hoteleria', 'Turismo y hotelería'],
  ['gastronomia', 'bienes_cobros_gastronomia', 'bienes_pagos_gastronomia', 'Gastronomía'],
  ['entretenimiento', 'bienes_cobros_entretenimiento', 'bienes_pagos_entretenimiento', 'Entretenimiento'],
  ['agua', 'bienes_cobros_agua', 'bienes_pagos_agua', 'Agua'],
  ['sector_publico', 'bienes_cobros_sector_publico', 'bienes_pagos_sector_publico', 'Sector público'],
  ['otros_spnf', 'bienes_cobros_otros_sector_privado_no_financiero', 'bienes_pagos_otros_sector_privado_no_financiero', 'Otros del sector privado no financiero'],
];
const SECTOR_NOTE = 'Sector según la actividad principal declarada ante ARCA por el cliente que opera en el mercado de cambios (no el producto exportado o importado).';
const SECTOR_TOTAL_NOTE = 'El total de esta apertura (dataset 184.1) puede diferir levemente de los cobros y pagos del balance cambiario (182.1): en 2003–2012 y algunos meses recientes hay diferencias de hasta decenas de millones de USD.';

const BIENES_SECTOR: Row[] = [
  gross('bienes_sector.cobros.total', 'bienes_cobros_totales_exportaciones', 'Cobros de exportaciones de bienes: total', 'Total', 'bc_cobros_sector', { notes: [SECTOR_NOTE, SECTOR_TOTAL_NOTE] }),
  ...SECTORES.map(([slug, key, , name]) => gross(`bienes_sector.cobros.${slug}`, key, `Cobros de exportaciones de bienes: ${name}`, name, 'bc_cobros_sector', { notes: [SECTOR_NOTE], priority: 2 })),
  gross('bienes_sector.pagos.total', 'pagos_importaciones_bienes', 'Pagos de importaciones de bienes: total', 'Total', 'bc_pagos_sector', { notes: [SECTOR_NOTE, SECTOR_TOTAL_NOTE] }),
  ...SECTORES.map(([slug, , key, name]) => gross(`bienes_sector.pagos.${slug}`, key, `Pagos de importaciones de bienes: ${name}`, name, 'bc_pagos_sector', { notes: [SECTOR_NOTE], priority: 2 })),
];

// ---------------------------------------------------------------- 185.1 Servicios por tipo
/** [slug, columna cobros, columna pagos, nombre, desde (si la apertura empieza después)] */
const SERVICIOS: [string, string, string, string, Period?][] = [
  ['turismo_viajes', 'cobro_servicios_turismo_viajes', 'pago_servicios_turismo_viajes', 'Turismo y viajes'],
  ['empresariales', 'cobro_servicios_empresariales_profesionales_tecnicos', 'pago_servicios_empresariales_profesionales_tecnicos', 'Empresariales, profesionales y técnicos'],
  ['fletes', 'cobro_servicios_fletes', 'pago_servicios_fletes', 'Fletes'],
  ['pasajeros', 'cobro_servicios_transporte_pasajeros', 'pago_servicios_transporte_pasajeros', 'Transporte de pasajeros'],
  ['otros_transporte', 'cobro_otros_servicios_transporte', 'pago_otros_servicios_transporte', 'Otros servicios de transporte'],
  ['informatica', 'cobro_servicios_informacion_informatica', 'pago_servicios_informacion_informatica', 'Información e informática'],
  ['propiedad_intelectual', 'cobr_serv_cargos_uso_la_prop_intelect', 'pag_serv_cargos_uso_prop_intelec', 'Cargos por uso de propiedad intelectual'],
  ['comunicaciones', 'cobro_servicios_comunicaciones_telecomunicaciones', 'pago_servicios_comunicaciones_telecomunicaciones', 'Comunicaciones y telecomunicaciones'],
  ['financieros', 'cobros_servicios_financieros', 'pagos_servicios_financieros', 'Financieros'],
  ['seguros', 'cobro_servicios_seguros', 'pago_servicios_seguros', 'Seguros'],
  ['comercio', 'cobro_servicios_relacionados_con_comercio', 'pago_servicios_relacionados_con_comercio', 'Relacionados con el comercio'],
  ['personales', 'cobro_servicios_personales_culturales_recreativos', 'pago_servicios_personales_culturales_recreativos', 'Personales, culturales y recreativos'],
  ['gobierno', 'cobro_servicios_gobierno', 'pago_servicios_gobierno', 'Servicios del gobierno'],
  ['construccion', 'cobro_servicios_construccion', 'pago_servicios_construccion', 'Construcción'],
  ['arrendamiento', 'cobro_servicios_arrendamiento_operativo', 'pago_servicios_arrendamiento_operativo', 'Arrendamiento operativo'],
  ['otros', 'otros_cobros_servicios', 'otros_pagos_servicios', 'Otros servicios', '2016-09'],
];

const SERVICIOS_TIPO: Row[] = [
  gross('servicios_tipo.cobros.total', 'servicios_total_ingresos_servicios', 'Cobros de servicios: total', 'Total', 'bc_servicios_cobros'),
  ...SERVICIOS.map(([slug, key, , name, from]) => gross(`servicios_tipo.cobros.${slug}`, key, `Cobros de servicios: ${name}`, name, 'bc_servicios_cobros', { priority: 2, ...(from ? { zeroAsNullBefore: from, notes: [`Apertura publicada desde ${from}.`] } : {}) })),
  gross('servicios_tipo.pagos.total', 'total_egresos_servicios', 'Pagos de servicios: total', 'Total', 'bc_servicios_pagos'),
  ...SERVICIOS.map(([slug, , key, name, from]) => gross(`servicios_tipo.pagos.${slug}`, key, `Pagos de servicios: ${name}`, name, 'bc_servicios_pagos', { priority: 2, ...(from ? { zeroAsNullBefore: from, notes: [`Apertura publicada desde ${from}.`] } : {}) })),
];

export const CAMBIARIO: SeriesDef[] = [
  ...BALANCE.map(def('sspm.balance_cambiario')),
  ...BIENES_SECTOR.map(def('sspm.bc_bienes_sector')),
  ...SERVICIOS_TIPO.map(def('sspm.bc_servicios_tipo')),
];
