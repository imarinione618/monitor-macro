/**
 * Fiscal: Sector Público Nacional no financiero, base caja, mensual (Secretaría de Hacienda).
 * Fuente: Informe Mensual de Ingresos y Gastos (IMIG), CSV de datos.gob.ar (dataset 452, distribución 452.3),
 * con la metodología vigente: excluye de los ingresos las rentas del BCRA y las rentas del FGS por títulos
 * del propio sector público; los intereses se registran netos de los pagados intra sector público.
 * Subtotales: suma de las partidas publicadas (cálculo propio, misma fuente y fecha). Solo dashboard.
 */
import type { SeriesDef } from '../types';

const base = { topic: 'fiscal', frequency: 'M', geography: 'Sector Público Nacional no financiero', seasonalAdjustment: 'original', priority: 1, status: 'verificado', currency: '$ corrientes' } as const;
const UNIT = 'Millones de $ corrientes';
const NOTE = 'Base caja. Metodología vigente de la Secretaría de Hacienda (excluye rentas del BCRA y del FGS por títulos del sector público).';
const ext = (key: string) => ({ kind: 'external' as const, feed: 'sspm.imig', key });

/** [id, columna IMIG, nombre, nombre corto, familia, notas extra] */
type Row = readonly [string, string, string, string, string, string?];
const PARTIDAS: Row[] = [
  // Ingresos
  ['ingresos.iva', 'iva_neto_reintegros', 'IVA neto de reintegros', 'IVA', 'fiscal_ingresos'],
  ['ingresos.ganancias', 'ganancias', 'Impuesto a las Ganancias', 'Ganancias', 'fiscal_ingresos'],
  ['ingresos.seguridad_social', 'aportes_contribuciones_seguridad_social', 'Aportes y contribuciones a la seguridad social', 'Seguridad social', 'fiscal_ingresos'],
  ['ingresos.debitos_creditos', 'debitos_creditos', 'Impuesto a los débitos y créditos', 'Débitos y créditos', 'fiscal_ingresos'],
  ['ingresos.bienes_personales', 'bienes_personales', 'Bienes personales', 'Bienes personales', 'fiscal_ingresos'],
  ['ingresos.internos', 'impuestos_internos', 'Impuestos internos', 'Internos', 'fiscal_ingresos'],
  ['ingresos.combustibles', 'combustibles', 'Impuesto a los combustibles (hasta 2019)', 'Combustibles', 'fiscal_aux', 'Desde 2020 se publica dentro de «Resto tributarios» (la columna vale 0).'],
  ['ingresos.derechos_exportacion', 'derechos_exportacion', 'Derechos de exportación', 'Derechos de exportación', 'fiscal_ingresos'],
  ['ingresos.derechos_importacion', 'derechos_importacion', 'Derechos de importación', 'Derechos de importación', 'fiscal_ingresos'],
  ['ingresos.resto_tributarios', 'resto_tributarios', 'Resto de ingresos tributarios', 'Resto tributarios', 'fiscal_ingresos', 'Incluye el impuesto a los combustibles desde 2020: la variación interanual de 2020 no es homogénea.'],
  ['ingresos.rentas_fgs', 'fgs_cobradas_sector_privado_sector_publico_financiero', 'Rentas de la propiedad del FGS cobradas al sector privado y financiero', 'Rentas FGS', 'fiscal_ingresos'],
  ['ingresos.rentas_resto', 'resto_rentas_propiedad', 'Resto de rentas de la propiedad', 'Resto rentas', 'fiscal_ingresos'],
  ['ingresos.no_tributarios', 'ingresos_no_tributarios', 'Ingresos no tributarios', 'No tributarios', 'fiscal_ingresos'],
  ['ingresos.transferencias', 'transferencias_corrientes', 'Transferencias corrientes recibidas', 'Transferencias recibidas', 'fiscal_ingresos'],
  ['ingresos.resto_corrientes', 'resto_ingresos_corrientes', 'Resto de ingresos corrientes', 'Resto ingresos corrientes', 'fiscal_ingresos'],
  ['ingresos.capital', 'ingresos_capital', 'Ingresos de capital', 'Ingresos de capital', 'fiscal_ingresos'],
  // Gastos primarios
  ['gastos.jubilaciones', 'jubilaciones_pensiones_contributivas', 'Jubilaciones y pensiones contributivas', 'Jubilaciones y pensiones', 'fiscal_gastos'],
  ['gastos.asignaciones', 'asignacion_familiares_hijo', 'Asignaciones familiares y AUH', 'Asignaciones y AUH', 'fiscal_gastos'],
  ['gastos.pensiones_no_contributivas', 'pensiones_no_contributivas', 'Pensiones no contributivas', 'Pensiones no contributivas', 'fiscal_gastos'],
  ['gastos.inssjp', 'prestaciones_inssjp', 'Prestaciones del INSSJP (PAMI)', 'PAMI', 'fiscal_gastos'],
  ['gastos.otros_programas', 'otros_programas', 'Otros programas sociales', 'Otros programas sociales', 'fiscal_gastos'],
  ['gastos.subsidios_energia', 'energia', 'Subsidios económicos: energía', 'Subsidios energía', 'fiscal_gastos'],
  ['gastos.subsidios_transporte', 'transporte', 'Subsidios económicos: transporte', 'Subsidios transporte', 'fiscal_gastos'],
  ['gastos.subsidios_otros', 'otras_funciones', 'Subsidios económicos: otras funciones', 'Otros subsidios', 'fiscal_gastos'],
  ['gastos.salarios', 'salarios', 'Gastos de funcionamiento: salarios', 'Salarios', 'fiscal_gastos'],
  ['gastos.otros_funcionamiento', 'otros_gastos_funcionamiento', 'Otros gastos de funcionamiento', 'Otros gastos de funcionamiento', 'fiscal_gastos'],
  ['gastos.transf_prov_educacion', 'transferencias_corrientes_provincias_educacion', 'Transferencias corrientes a provincias: educación', 'Transf. provincias: educación', 'fiscal_gastos'],
  ['gastos.transf_prov_seguridad_social', 'transferencias_corrientes_provincias_seguridad_social', 'Transferencias corrientes a provincias: seguridad social', 'Transf. provincias: seg. social', 'fiscal_gastos'],
  ['gastos.transf_prov_desarrollo_social', 'transferencias_corrientes_provincias_desarrollo_social', 'Transferencias corrientes a provincias: desarrollo social', 'Transf. provincias: desarrollo social', 'fiscal_aux', 'Vale 0 desde 2020 en la fuente.'],
  ['gastos.transf_prov_salud', 'transferencias_corrientes_provincias_salud', 'Transferencias corrientes a provincias: salud', 'Transf. provincias: salud', 'fiscal_gastos'],
  ['gastos.transf_prov_otras', 'transferencias_corrientes_provincias_otras', 'Transferencias corrientes a provincias: otras', 'Transf. provincias: otras', 'fiscal_gastos'],
  ['gastos.universidades', 'otros_corrientes_transferencias_universidades', 'Transferencias a universidades', 'Universidades', 'fiscal_gastos'],
  ['gastos.deficit_empresas', 'otros_corrientes_deficit_operativo_empresas_publicas', 'Déficit operativo de empresas públicas', 'Déficit empresas públicas', 'fiscal_aux', 'Vale 0 desde 2020 en el IMIG (se incluye en otras líneas).'],
  ['gastos.otros_corrientes_resto', 'otros_corrientes_resto', 'Otros gastos corrientes: resto', 'Otros gastos corrientes', 'fiscal_gastos'],
  ['gastos.capital_energia_nacion', 'capital_energia_nacion', 'Gasto de capital en energía — Nación', 'Capital energía (Nación)', 'fiscal_capital'],
  ['gastos.capital_energia_provincias', 'capital_energia_tranferencias_provincias', 'Gasto de capital en energía — transferencias a provincias', 'Capital energía (provincias)', 'fiscal_capital'],
  ['gastos.capital_transporte_nacion', 'capital_transporte_nacion', 'Gasto de capital en transporte — Nación', 'Capital transporte (Nación)', 'fiscal_capital'],
  ['gastos.capital_transporte_provincias', 'capital_transporte_tranferencias_provincias', 'Gasto de capital en transporte — transferencias a provincias', 'Capital transporte (provincias)', 'fiscal_capital'],
  ['gastos.capital_educacion_nacion', 'capital_educacion_nacion', 'Gasto de capital en educación — Nación', 'Capital educación (Nación)', 'fiscal_capital'],
  ['gastos.capital_educacion_provincias', 'capital_educacion_tranferencias_provincias', 'Gasto de capital en educación — transferencias a provincias', 'Capital educación (provincias)', 'fiscal_capital'],
  ['gastos.capital_vivienda_nacion', 'capital_vivienda_nacion', 'Gasto de capital en vivienda — Nación', 'Capital vivienda (Nación)', 'fiscal_capital'],
  ['gastos.capital_vivienda_provincias', 'capital_vivienda_tranferencias_provincias', 'Gasto de capital en vivienda — transferencias a provincias', 'Capital vivienda (provincias)', 'fiscal_capital'],
  ['gastos.capital_agua_nacion', 'capital_agua_potable_alcatarillado_nacion', 'Gasto de capital en agua potable y alcantarillado — Nación', 'Capital agua (Nación)', 'fiscal_capital'],
  ['gastos.capital_agua_provincias', 'capital_agua_potable_alcatarillado_tranferencias_provincias', 'Gasto de capital en agua potable y alcantarillado — transferencias a provincias', 'Capital agua (provincias)', 'fiscal_capital'],
  ['gastos.capital_otros_nacion', 'capital_otros_nacion', 'Otros gastos de capital — Nación', 'Capital otros (Nación)', 'fiscal_capital'],
  ['gastos.capital_otros_provincias', 'capital_otros_tranferencias_provincias', 'Otros gastos de capital — transferencias a provincias', 'Capital otros (provincias)', 'fiscal_capital'],
  ['gastos.fondo_federal_solidario', 'fondo_federal_solidario', 'Fondo Federal Solidario', 'Fondo Federal Solidario', 'fiscal_aux', 'Vale 0 desde 2018 en la fuente.'],
  ['gastos.intereses', 'intereses_netos', 'Intereses netos', 'Intereses', 'fiscal_resultados', 'Netos de los intereses pagados dentro del sector público. Base caja: los intereses capitalizados no se registran como gasto.'],
];

const RESULTADOS: Row[] = [
  ['resultado.primario', 'resultado_primario', 'Resultado primario', 'Resultado primario', 'fiscal_resultados'],
  ['resultado.financiero', 'resultado_financiero', 'Resultado financiero', 'Resultado financiero', 'fiscal_resultados', 'Resultado primario menos intereses netos.'],
];

const toDef = (measure: 'flow' | 'balance') => ([id, key, name, shortName, family, note]: Row): SeriesDef => ({
  ...base, id: `fiscal.${id}`, family, name, shortName, measure, unit: UNIT, source: ext(key), notes: [NOTE, ...(note ? [note] : [])],
});

const sum = (id: string, name: string, shortName: string, family: string, inputs: string[], measure: 'flow' | 'balance' = 'flow'): SeriesDef => ({
  ...base, id: `fiscal.${id}`, family, name, shortName, measure, unit: UNIT,
  source: { kind: 'derived', op: { type: 'sum', inputs: inputs.map((i) => `fiscal.${i}`) } },
  notes: [NOTE, `Cálculo propio: suma de ${inputs.length} partidas publicadas en el IMIG (misma fuente y mes).`],
});

const SUBTOTALES: SeriesDef[] = [
  sum('ingresos.tributarios', 'Ingresos tributarios (incluye seguridad social)', 'Tributarios', 'fiscal_ingresos_sub', ['ingresos.iva', 'ingresos.ganancias', 'ingresos.seguridad_social', 'ingresos.debitos_creditos', 'ingresos.bienes_personales', 'ingresos.internos', 'ingresos.combustibles', 'ingresos.derechos_exportacion', 'ingresos.derechos_importacion', 'ingresos.resto_tributarios']),
  sum('ingresos.rentas', 'Rentas de la propiedad', 'Rentas de la propiedad', 'fiscal_ingresos_sub', ['ingresos.rentas_fgs', 'ingresos.rentas_resto']),
  sum('ingresos.otros_corrientes', 'Otros ingresos corrientes', 'Otros ingresos corrientes', 'fiscal_ingresos_sub', ['ingresos.no_tributarios', 'ingresos.transferencias', 'ingresos.resto_corrientes']),
  sum('ingresos.total', 'Ingresos totales', 'Ingresos totales', 'fiscal_totales', ['ingresos.tributarios', 'ingresos.rentas', 'ingresos.otros_corrientes', 'ingresos.capital']),
  sum('gastos.prestaciones_sociales', 'Prestaciones sociales', 'Prestaciones sociales', 'fiscal_gastos_sub', ['gastos.jubilaciones', 'gastos.asignaciones', 'gastos.pensiones_no_contributivas', 'gastos.inssjp', 'gastos.otros_programas']),
  sum('gastos.subsidios', 'Subsidios económicos', 'Subsidios económicos', 'fiscal_gastos_sub', ['gastos.subsidios_energia', 'gastos.subsidios_transporte', 'gastos.subsidios_otros']),
  sum('gastos.funcionamiento', 'Gastos de funcionamiento', 'Gastos de funcionamiento', 'fiscal_gastos_sub', ['gastos.salarios', 'gastos.otros_funcionamiento']),
  sum('gastos.transf_provincias', 'Transferencias corrientes a provincias', 'Transf. a provincias', 'fiscal_gastos_sub', ['gastos.transf_prov_educacion', 'gastos.transf_prov_seguridad_social', 'gastos.transf_prov_desarrollo_social', 'gastos.transf_prov_salud', 'gastos.transf_prov_otras']),
  sum('gastos.otros_corrientes', 'Otros gastos corrientes', 'Otros gastos corrientes', 'fiscal_gastos_sub', ['gastos.universidades', 'gastos.deficit_empresas', 'gastos.otros_corrientes_resto']),
  sum('gastos.capital', 'Gastos de capital', 'Gastos de capital', 'fiscal_gastos_sub', ['gastos.capital_energia_nacion', 'gastos.capital_energia_provincias', 'gastos.capital_transporte_nacion', 'gastos.capital_transporte_provincias', 'gastos.capital_educacion_nacion', 'gastos.capital_educacion_provincias', 'gastos.capital_vivienda_nacion', 'gastos.capital_vivienda_provincias', 'gastos.capital_agua_nacion', 'gastos.capital_agua_provincias', 'gastos.capital_otros_nacion', 'gastos.capital_otros_provincias', 'gastos.fondo_federal_solidario']),
  sum('gastos.primario', 'Gasto primario', 'Gasto primario', 'fiscal_totales', ['gastos.prestaciones_sociales', 'gastos.subsidios', 'gastos.funcionamiento', 'gastos.transf_provincias', 'gastos.otros_corrientes', 'gastos.capital']),
  sum('gastos.total', 'Gasto total (primario + intereses)', 'Gasto total', 'fiscal_totales', ['gastos.primario', 'gastos.intereses']),
];

export const FISCAL: SeriesDef[] = [...PARTIDAS.map(toDef('flow')), ...RESULTADOS.map(toDef('balance')), ...SUBTOTALES];

/** Orden del cuadro fiscal: [id, nivel de sangría]. */
export const FISCAL_CUADRO: [string, number][] = [
  ['fiscal.ingresos.total', 0],
  ['fiscal.ingresos.tributarios', 1], ['fiscal.ingresos.iva', 2], ['fiscal.ingresos.ganancias', 2], ['fiscal.ingresos.seguridad_social', 2], ['fiscal.ingresos.debitos_creditos', 2], ['fiscal.ingresos.derechos_exportacion', 2], ['fiscal.ingresos.derechos_importacion', 2], ['fiscal.ingresos.bienes_personales', 2], ['fiscal.ingresos.internos', 2], ['fiscal.ingresos.resto_tributarios', 2],
  ['fiscal.ingresos.rentas', 1], ['fiscal.ingresos.rentas_fgs', 2], ['fiscal.ingresos.rentas_resto', 2],
  ['fiscal.ingresos.otros_corrientes', 1], ['fiscal.ingresos.capital', 1],
  ['fiscal.gastos.primario', 0],
  ['fiscal.gastos.prestaciones_sociales', 1], ['fiscal.gastos.jubilaciones', 2], ['fiscal.gastos.asignaciones', 2], ['fiscal.gastos.pensiones_no_contributivas', 2], ['fiscal.gastos.inssjp', 2], ['fiscal.gastos.otros_programas', 2],
  ['fiscal.gastos.subsidios', 1], ['fiscal.gastos.subsidios_energia', 2], ['fiscal.gastos.subsidios_transporte', 2], ['fiscal.gastos.subsidios_otros', 2],
  ['fiscal.gastos.funcionamiento', 1], ['fiscal.gastos.salarios', 2], ['fiscal.gastos.otros_funcionamiento', 2],
  ['fiscal.gastos.transf_provincias', 1], ['fiscal.gastos.otros_corrientes', 1], ['fiscal.gastos.universidades', 2],
  ['fiscal.gastos.capital', 1],
  ['fiscal.resultado.primario', 0],
  ['fiscal.gastos.intereses', 1],
  ['fiscal.resultado.financiero', 0],
];
