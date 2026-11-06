/** Definición de la serie de caución A3 (sin dependencias de Node: se usa también en el navegador). */
import type { MonetaryDef } from './types';

export const CAUCION_URL = 'https://ws.matbarofex.com.ar:8999/api/caucion';
export const CAUCION_FIRST_DATE = '2024-11-07';
export const CAUCION_INDEX_NAME = 'I.CAUCION';

export const CAUCION_DEF: MonetaryDef = {
  id: 'monetario.a3.caucion',
  bcraId: -1,
  provider: 'A3',
  name: 'Tasa de caución a 1 día (índice I.CAUCION, A3 Mercados)',
  shortName: 'Caución 1 día',
  group: 'market_rates',
  category: 'caucion',
  currency: 'ARS',
  sector: 'other',
  unit: '% TNA',
  scale: 1,
  originalUnit: 'Tasa nominal anual (%)',
  rawScale: 1,
  kind: 'rate',
  frequency: 'D',
  convention: 'Tasa nominal anual; valor de cierre diario publicado por A3 Mercados',
  coverage: 'Cauciones en pesos a 1 día hábil',
  sourceUrl: 'https://a3mercados.com.ar/',
  methodology: 'Tasa de referencia diaria de caución en pesos a 1 día hábil publicada por A3 Mercados (índice I.CAUCION): mediana ponderada por volumen de las operaciones del día, redondeada al punto básico. A3 también publica los percentiles 1, 25, 75 y 99 y el volumen operado; acá se almacena solo la tasa de referencia. No es una serie del BCRA.',
  firstDate: CAUCION_FIRST_DATE,
  lastDate: CAUCION_FIRST_DATE,
  regimeNotes: ['Fuente de mercado (A3 Mercados), no BCRA. Picos de volatilidad (p. ej. 102% TNA el 15/10/2025) son valores publicados, no errores de carga.'],
};
