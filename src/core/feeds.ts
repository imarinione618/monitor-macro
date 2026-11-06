/**
 * Fuentes externas a la API INDEC (solo dashboard; nunca Google Sheets).
 *
 *  - `sspm_csv`: CSV de distribución del catálogo SSPM de datos.gob.ar (API de Series de Tiempo).
 *    Se lee el CSV y no la API JSON porque la API devuelve vacías o atrasadas varias series
 *    que el CSV trae completas (verificado 2026-11-06). Columna = `serie_titulo`.
 *  - `idecba_*`: archivos XLSX del Instituto de Estadística y Censos de la Ciudad de Buenos Aires.
 *
 * Sin dependencias de Node: también se usa en el navegador para rotular fuentes.
 */
import type { Frequency } from './types';

export type FeedKind = 'sspm_csv' | 'idecba_ipcba' | 'idecba_restaurantes';

export interface FeedConfig {
  id: string;
  kind: FeedKind;
  title: string;
  /** Organismo productor del dato. */
  producer: string;
  /** Texto para «Fuente: one618 en base a …». */
  sourceLabel: string;
  frequency: Frequency;
  /** URL del archivo (sspm_csv) o página de referencia. */
  url: string;
  methodologyUrl?: string;
  /** ID de la API de Series de Tiempo (distribución), para trazabilidad. */
  distributionId?: string;
}

const SSPM = 'https://infra.datos.gob.ar/catalog/sspm/dataset';
const sspm = (id: string, distribution: string, file: string, title: string, producer: string, sourceLabel: string, frequency: Frequency, methodologyUrl?: string): FeedConfig => ({
  id, kind: 'sspm_csv', title, producer, sourceLabel, frequency, distributionId: distribution,
  url: `${SSPM}/${distribution.split('.')[0]}/distribution/${distribution}/download/${file}`, methodologyUrl,
});

const INDEC_SSPM = 'INDEC (vía datos.gob.ar, Series de Tiempo)';
const HACIENDA_SSPM = 'Secretaría de Hacienda (vía datos.gob.ar, Series de Tiempo)';

export const FEEDS: Record<string, FeedConfig> = Object.fromEntries(([
  sspm('sspm.oyd_constantes', '4.2', 'oferta-demanda-globales-precios-2004-valores-trimestrales-base-2004.csv', 'Oferta y demanda globales, precios de 2004', 'INDEC', INDEC_SSPM, 'Q', 'https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-9-47'),
  sspm('sspm.oyd_corrientes', '4.4', 'oferta-demanda-globales-precios-corrientes-valores-trimestrales-base-2004.csv', 'Oferta y demanda globales, precios corrientes', 'INDEC', INDEC_SSPM, 'Q', 'https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-9-47'),
  sspm('sspm.oyd_desest', '3.2', 'oferta-demanda-globales-datos-desestacionalizados-valores-trimestral-base-2004.csv', 'Oferta y demanda globales desestacionalizadas', 'INDEC', INDEC_SSPM, 'Q', 'https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-9-47'),
  sspm('sspm.oyd_deflactores', '25.2', 'indice-precios-implicitos-oferta-demanda-globales-valores-trimestrales-base-2004.csv', 'Índices de precios implícitos de oferta y demanda', 'INDEC', INDEC_SSPM, 'Q'),
  sspm('sspm.vab_constantes', '6.2', 'producto-interno-bruto-valores-trimestrales-base-2004.csv', 'PIB y VAB por sector, precios de 2004', 'INDEC', INDEC_SSPM, 'Q'),
  sspm('sspm.vab_corrientes', '8.2', 'producto-interno-bruto-precios-corrientes-valores-trimestrales-base-2004.csv', 'PIB y VAB por sector, precios corrientes', 'INDEC', INDEC_SSPM, 'Q'),
  sspm('sspm.supermercados', '455.1', 'ventas-totales-supermercados-2.csv', 'Encuesta de supermercados', 'INDEC', INDEC_SSPM, 'M', 'https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-1-34'),
  sspm('sspm.mayoristas', '456.1', 'ventas-totales-autoservicios-mayoristas.csv', 'Encuesta de autoservicios mayoristas', 'INDEC', INDEC_SSPM, 'M', 'https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-1-34'),
  sspm('sspm.shoppings', '458.1', 'ventas-totales-nacionales-centros-compras-valores-mensuales.csv', 'Encuesta de centros de compras', 'INDEC', INDEC_SSPM, 'M', 'https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-1-34'),
  sspm('sspm.imig', '452.3', 'imig-mensual.csv', 'Informe mensual de ingresos y gastos del SPN (IMIG), base caja', 'Secretaría de Hacienda', HACIENDA_SSPM, 'M', 'https://www.argentina.gob.ar/economia/sechacienda/informemensual'),
  sspm('sspm.aif', '379.9', 'sector-publico-nacional-valores-mensuales-17.csv', 'Esquema Ahorro-Inversión-Financiamiento del SPN, base caja (metodología 2017)', 'Secretaría de Hacienda', HACIENDA_SSPM, 'M', 'https://www.mecon.gob.ar/onp/html/'),
  { id: 'idecba.ipcba', kind: 'idecba_ipcba', title: 'Índice de Precios al Consumidor de la Ciudad de Buenos Aires (IPCBA)', producer: 'IDECBA', sourceLabel: 'IDECBA', frequency: 'M', url: 'https://www.estadisticaciudad.gob.ar/eyc/?cat=93', methodologyUrl: 'https://www.estadisticaciudad.gob.ar/eyc/?cat=93' },
  { id: 'idecba.restaurantes', kind: 'idecba_restaurantes', title: 'Actividad en restaurantes tradicionales de la Ciudad de Buenos Aires (EREST)', producer: 'IDECBA', sourceLabel: 'IDECBA', frequency: 'M', url: 'https://www.estadisticaciudad.gob.ar/eyc/' },
] as FeedConfig[]).map((f) => [f.id, f]));

export function feedOf(id: string): FeedConfig | undefined {
  return FEEDS[id];
}
