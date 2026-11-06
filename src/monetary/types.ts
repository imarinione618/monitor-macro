/** Contratos BCRA separados del registro INDEC y de las sincronizaciones Sheets. */
export interface MonetaryDef {
  id: string;
  /** ID de la API BCRA. 0 = cálculo propio; -1 = serie de otra fuente (ver `provider`). */
  bcraId: number;
  /** Proveedor de la serie. Ausente = BCRA. */
  provider?: 'BCRA' | 'A3';
  name: string;
  shortName: string;
  group: 'passive_rates' | 'active_rates' | 'policy_rates' | 'market_rates' | 'deposits' | 'loans' | 'base' | 'instruments' | 'aggregates';
  category: string;
  currency: 'ARS' | 'USD' | null;
  sector: 'private' | 'public' | 'total' | 'bcra' | 'other';
  unit: string;
  scale: number;
  originalUnit: string;
  rawScale: number;
  kind: 'rate' | 'stock';
  frequency: 'D' | 'M';
  convention: string;
  coverage: string;
  sourceUrl: string;
  methodology: string;
  firstDate: string;
  lastDate: string;
  monthlyConvention?: 'mean' | 'close';
  monthlyCompanionId?: string;
  regimeNotes?: string[];
  /** Solo instrumentos expresamente auditados como pasivos aditivos en ARS. */
  eligibleInstrument?: boolean;
  balanceSide?: 'asset' | 'liability';
  issuer?: 'BCRA' | 'Tesoro Nacional';
}

export interface MonetaryObservation { date: string; value: number | null }
export interface MonetarySeries {
  def: MonetaryDef;
  observations: MonetaryObservation[];
  retrievedAt: string;
  stale: boolean;
  error?: string;
}

export interface BcraMetadata {
  idVariable: number; descripcion: string; categoria: string; tipoSerie: string;
  periodicidad: string; unidadExpresion: string; moneda: string;
  primerFechaInformada: string; ultFechaInformada: string; ultValorInformado: number;
}
export interface MonetaryStore { series: MonetarySeries[]; updatedAt: string | null; error?: string }
export interface MonetaryManifest {
  schemaVersion: 1;
  updatedAt: string | null;
  lastAttemptAt: string;
  lastFullAt: string | null;
  series: Record<string, { count: number; firstDate: string | null; lastDate: string | null; retrievedAt: string; stale: boolean; error?: string }>;
}
