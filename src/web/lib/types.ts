/**
 * Tipos serializables que viajan del servidor (lectura del store) al cliente.
 * No contienen credenciales ni URLs de consulta: solo definiciones del registro,
 * observaciones y metadatos de estado.
 */
import type { Observation, Period, SeriesDef } from '@/core/types';

export interface SourceRef {
  /** Título del dataset del INDEC. */
  title: string;
  producer?: string;
  methodologyUrl?: string;
}

export interface ClientSeries {
  def: SeriesDef;
  observations: Observation[];
  /** true si no hay archivo de datos para la serie en el store. */
  missing: boolean;
  firstPeriod: Period | null;
  lastPeriod: Period | null;
  retrievedAt: string | null;
  /** Datos conservados de una corrida anterior (la última falló). */
  stale: boolean;
  /** Error informado en el manifest para la serie, si existe. */
  error?: string;
  synthetic: boolean;
  /** Filas suprimidas (secreto estadístico "s") excluidas de una suma. */
  suppressedRows?: number;
  sources: SourceRef[];
}

export type RangeId = '12m' | '24m' | '5y' | 'all';

export const RANGE_LABELS: Record<RangeId, string> = {
  '12m': '12 meses',
  '24m': '24 meses',
  '5y': '5 años',
  all: 'Todo',
};

/** Años cubiertos por cada rango (null = todo). */
export const RANGE_YEARS: Record<RangeId, number | null> = { '12m': 1, '24m': 2, '5y': 5, all: null };

export type ChartKind = 'line' | 'bar' | 'stacked';
