/** Contratos del módulo de precios de combustibles (sin dependencias de Node: utilizable en el navegador). */

export type FuelProduct = 'super' | 'premium' | 'gasoil_g2' | 'gasoil_g3';
export type FuelScope = 'nacional' | 'caba';

export interface FuelBreak { date: string; note: string }

export interface FuelDef {
  id: string;
  name: string;
  shortName: string;
  product: FuelProduct;
  scope: FuelScope;
  /** D: observaciones diarias (YYYY-MM-DD); M: mensuales (YYYY-MM). */
  frequency: 'D' | 'M';
  unit: 'ARS por litro';
  method: string;
  source: string;
  sourceUrl: string;
  breaks?: FuelBreak[];
}

export interface FuelObservation {
  date: string;
  /** Faltante = null, nunca 0. */
  value: number | null;
  /** Estaciones (diaria) o registros (mensual) usados en el cálculo. */
  n?: number;
}

export interface FuelSeries {
  def: FuelDef;
  observations: FuelObservation[];
  retrievedAt: string;
  stale: boolean;
  error?: string;
}

export interface FuelRevision {
  id: string;
  date: string;
  oldValue: number | null;
  newValue: number | null;
  oldN?: number;
  newN?: number;
  kind: 'revised' | 'removed' | 'added_historical';
  detectedAt: string;
  runId: string;
}

export interface FuelManifest {
  schemaVersion: 1;
  updatedAt: string | null;
  lastAttemptAt: string;
  surtidor: {
    /** Última reconciliación con el histórico completo de la Res. 314/2016. */
    lastHistoricoAt: string | null;
    /** Última lectura de la foto de precios vigentes. */
    lastVigentesAt: string | null;
    /** Marca de tiempo (hora local) del evento más reciente publicado. */
    lastEventAt: string | null;
    /** Último día calculado (cerrado). */
    lastDay: string | null;
    mode?: 'historico' | 'vigentes';
    error?: string;
  };
  eess: {
    /** Última descarga del archivo vigente (desde 2024/12) de la Res. 1104/04. */
    lastVigenteAt: string | null;
    /** Última descarga de los archivos anuales. */
    lastAnnualAt: string | null;
    lastPeriod: string | null;
    error?: string;
  };
  series: Record<string, { count: number; firstDate: string | null; lastDate: string | null; lastValue: number | null; retrievedAt: string; stale: boolean; error?: string }>;
}
