/**
 * CONTRATO DE DATOS COMPARTIDO
 * ---------------------------------------------------------------------------
 * Tipos usados por la ingesta (src/ingest), Google Sheets (src/sheets) y el
 * dashboard (src/app, src/web). Cambiar este archivo implica revisar los tres.
 *
 * Convenciones:
 *  - Período de referencia (`period`) ≠ fecha de publicación ≠ fecha de consulta.
 *  - Valores almacenados SIN redondear. Faltante = null (nunca 0).
 *  - Un SeriesDef describe UNA serie homogénea: misma frecuencia, unidad,
 *    ajuste estacional y base. Nunca se mezclan.
 */

// ---------------------------------------------------------------- Básicos

export type Topic = 'actividad' | 'laboral' | 'precios' | 'comex';

export const TOPIC_LABELS: Record<Topic, string> = {
  actividad: 'Actividad',
  laboral: 'Mercado laboral',
  precios: 'Precios',
  comex: 'Comercio exterior',
};

/** M = mensual, Q = trimestral, S = semestral, A = anual */
export type Frequency = 'M' | 'Q' | 'S' | 'A';

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  M: 'Mensual',
  Q: 'Trimestral',
  S: 'Semestral',
  A: 'Anual',
};

/**
 * Período canónico interno:
 *  M: "2024-03"   Q: "2024-Q1"   S: "2024-S1"   A: "2024"
 * Ver src/core/periods.ts.
 */
export type Period = string;

export type SeasonalAdjustment = 'original' | 'desestacionalizada' | 'tendencia-ciclo' | 'no_aplica';

/**
 * Naturaleza económica de la serie. Determina qué transformaciones son válidas
 * (ver ALLOWED_TRANSFORMS en src/core/transforms.ts).
 */
export type Measure =
  | 'index' // número índice (EMAE, IPC, IPI, salarios, ICC, SIPM)
  | 'rate' // tasa en % (desocupación, actividad, pobreza) -> diferencias en p.p.
  | 'flow' // flujo en moneda (exportaciones, importaciones), sumable en el tiempo
  | 'balance' // saldo que puede ser negativo (saldo comercial) -> diferencias absolutas
  | 'price_level' // valor monetario de un stock/canasta (CBA, CBT en $) -> % variación
  | 'published_change' // variación % publicada por la fuente (no se re-transforma)
  | 'weight' // ponderación
  | 'incidence'; // incidencia publicada por la fuente (p.p.)

export type SeriesStatus =
  | 'verificado' // probado contra la API real (selector devuelve 1 serie, datos OK)
  | 'pendiente_verificacion' // endpoint existe en el OpenAPI, selector aún no verificado con token
  | 'no_encontrado' // no existe en la API
  | 'fuente_complementaria'; // requiere otra fuente oficial (no implementado en núcleo)

/** Signos convencionales del INDEC (informados en `observaciones`). */
export type ObservationFlag =
  | 'provisorio' // *
  | 'preliminar' // **
  | 'estimado' // e
  | 'imputado' // i
  | 'calidad_inferior' // u
  | 'cero_absoluto' // -
  | 'no_registrado' // .
  | 'no_disponible' // ...
  | 'no_corresponde' // ///
  | 'confidencial'; // s

// ---------------------------------------------------------------- Datasets

/** Identificador del endpoint oficial (path sin "/"). */
export type DatasetId =
  | 'estimador-mensual-de-actividad-economica-nivel-general'
  | 'estimador-mensual-de-actividad-economica-sectores'
  | 'ipi_manufacturero'
  | 'ipi_minero'
  | 'ipc_nacional'
  | 'valorizacion_canastas_cba_cbt'
  | 'indice_salarios'
  | 'icc_precios_construccion'
  | 'sipm_precios_mayoristas'
  | 'mercado_trabajo_eph'
  | 'pobreza_eph'
  | 'comercio_exterior_exportacion_bienes'
  | 'comercio_exterior_importacion_bienes'
  | 'comercio_exterior_nomenclaturas';

export interface DatasetConfig {
  id: DatasetId;
  /** Path del endpoint relativo a la URL base, p.ej. "/ipc_nacional". */
  path: string;
  title: string;
  /** Dirección del INDEC responsable (según OpenAPI). */
  producer: string;
  /** Clave primaria documentada en el OpenAPI, en orden. Se usa para `order` al paginar. */
  primaryKey: string[];
  frequency: Frequency | null;
  /**
   * Cómo derivar el período canónico de cada fila.
   *  - yearMonth: columnas de año y mes.
   *  - yearQuarter / yearSemester: año + trimestre/semestre.
   */
  period:
    | { kind: 'yearMonth'; yearField: string; monthField: string; rawField: string }
    | { kind: 'yearQuarter'; yearField: string; quarterField: string; rawField: string }
    | { kind: 'yearSemester'; yearField: string; semesterField: string; rawField: string }
    | { kind: 'none' };
  /** Columna con el campo de período crudo para filtros incrementales (gte). */
  periodFilterField?: string;
  /** Cómo serializar un período canónico para filtrar `periodFilterField` (p.ej. "202403"). */
  periodFilterFormat?: 'YYYYMM' | 'YYYY';
  /**
   * "full": se descarga completo en cada corrida (tablas chicas; captura revisiones
   *         de toda la historia, p.ej. series desestacionalizadas que se recalculan).
   * "windowed": se descarga una ventana reciente (revisionWindowMonths) en corridas
   *             diarias y la historia completa cada fullReconcileDays.
   */
  refreshMode: 'full' | 'windowed';
  revisionWindowMonths: number;
  fullReconcileDays: number;
  /** Filtros PostgREST fijos (sin token en URL) para reducir el volumen. p.ej. { region: 'in.(...)' } */
  fetchFilters?: Record<string, string>;
  /** Columnas a pedir con `select` (null = todas). */
  select?: string[];
  methodologyUrl?: string;
  /** Inicio documentado en el OpenAPI (texto libre). */
  documentedStart?: string;
  notes?: string;
}

// ---------------------------------------------------------------- Series

/** Filtro exacto sobre columnas de la fila cruda: { columna: valor }. */
export type Selector = Record<string, string | number>;

export interface SourceSpec {
  kind: 'api';
  dataset: DatasetId;
  /** Filas que pertenecen a la serie. Debe identificar UNA serie (verificar con data:check). */
  selector: Selector;
  /** Columna numérica que contiene el valor (por defecto "valor"). */
  valueField?: string;
  /**
   * Si la serie surge de agregar varias filas por período (p.ej. comercio exterior
   * por país -> total), indicar 'sum'. Las filas con valor null (p.ej. "s"
   * confidencial) se reportan en `meta.suppressedRows` y la serie se marca con
   * nota; NO se tratan como cero.
   */
  aggregate?: 'sum';
  /** Escala aplicada al valor crudo para expresarlo en `unit` (p.ej. USD -> millones: 1e-6). */
  scaleFactor?: number;
}

/** Serie derivada calculada en la capa compartida (no viene de la API). */
export interface DerivedSpec {
  kind: 'derived';
  op:
    | { type: 'difference'; minuend: string; subtrahend: string } // saldo = X - M
    | { type: 'real_index'; nominal: string; deflator: string; basePeriod: Period } // salario real
    | { type: 'sum'; inputs: string[] };
}

export interface SeriesDef {
  /** ID interno estable. Formato: <tema>.<familia>.<apertura>[.<ajuste>]. NUNCA renombrar. */
  id: string;
  topic: Topic;
  /** Familia para agrupar en pestañas y gráficos (p.ej. "emae", "ipc_divisiones"). */
  family: string;
  name: string;
  shortName: string;
  frequency: Frequency;
  measure: Measure;
  unit: string; // p.ej. "Índice base 2004=100", "%", "Millones de USD"
  base?: string; // p.ej. "2004=100", "dic-2016=100"
  seasonalAdjustment: SeasonalAdjustment;
  geography: string; // p.ej. "Total país", "GBA", "31 aglomerados urbanos"
  coverage?: string;
  /** Moneda y valuación, si aplica (p.ej. "USD corrientes, FOB"). */
  currency?: string;
  source: SourceSpec | DerivedSpec;
  status: SeriesStatus;
  /** Prioridad: 1 = núcleo primera versión, 2 = aperturas. */
  priority: 1 | 2;
  /** Notas metodológicas que deben viajar con la serie a Sheets y dashboard. */
  notes?: string[];
  /** Mostrar como tarjeta en el resumen general. */
  headline?: {
    order: number;
    /** Transformación principal a mostrar en la tarjeta. */
    transform: TransformId;
    /** Comparación secundaria. */
    compare?: TransformId;
  };
  /** Otra serie con la misma apertura pero distinto ajuste (para toggles). */
  seasonalVariants?: Partial<Record<SeasonalAdjustment, string>>;
}

// ---------------------------------------------------------------- Observaciones

export interface Observation {
  period: Period;
  /** Valor sin redondear. null = faltante (ver flags). */
  value: number | null;
  flags?: ObservationFlag[];
  /** Texto original de `observaciones`, si existía. */
  rawNote?: string;
}

export interface SeriesData {
  id: string;
  /** Observaciones ordenadas ascendentemente por período, sin duplicados. */
  observations: Observation[];
  meta: {
    firstPeriod: Period | null;
    lastPeriod: Period | null;
    /** ISO 8601. Momento de la consulta a la API que produjo estos datos. */
    retrievedAt: string;
    /** ID de corrida de ingesta (trazabilidad). */
    runId: string;
    /** Dataset de origen y URL de consulta SIN credenciales. */
    dataset?: DatasetId;
    query?: string;
    /** Fecha de publicación informada por la fuente, si existe (la API no la expone a la fecha). */
    publishedAt?: string | null;
    /** Filas con valor nulo excluidas de una agregación (ver SourceSpec.aggregate). */
    suppressedRows?: number;
    /** true si estos datos son de una corrida anterior porque la última falló. */
    stale?: boolean;
    /** Si la serie viene de fixtures sintéticos. */
    synthetic?: boolean;
  };
}

// ---------------------------------------------------------------- Revisiones

export interface RevisionRecord {
  seriesId: string;
  period: Period;
  oldValue: number | null;
  newValue: number | null;
  /** ISO 8601 */
  detectedAt: string;
  runId: string;
  kind: 'revised' | 'added_historical' | 'removed';
}

// ---------------------------------------------------------------- Manifest / estado

export type ErrorKind = 'auth' | 'rate_limit' | 'data' | 'network' | 'server' | 'config' | 'unknown';

export interface DatasetRunStatus {
  dataset: DatasetId;
  /** ISO de la última consulta exitosa. */
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastRunId: string | null;
  ok: boolean;
  error?: { kind: ErrorKind; message: string; httpStatus?: number };
  rowsFetched?: number;
  /** Total de filas informado por Content-Range. */
  totalRows?: number | null;
  lastFullReconcileAt?: string | null;
  mode?: 'full' | 'windowed';
}

export interface Manifest {
  schemaVersion: 1;
  /** 'real' = API oficial. 'synthetic' = fixtures de desarrollo (NO reales). */
  dataMode: 'real' | 'synthetic';
  generatedAt: string;
  lastRun: {
    runId: string;
    startedAt: string;
    finishedAt: string | null;
    ok: boolean;
    partial: boolean;
  } | null;
  datasets: Partial<Record<DatasetId, DatasetRunStatus>>;
  series: Record<
    string,
    {
      firstPeriod: Period | null;
      lastPeriod: Period | null;
      count: number;
      retrievedAt: string | null;
      stale: boolean;
      error?: string;
    }
  >;
}

// ---------------------------------------------------------------- Transformaciones

export type TransformId =
  | 'level' // valor tal cual
  | 'pct_prev' // variación % vs período anterior (m/m o t/t)
  | 'pct_yoy' // variación % interanual (mismo período año anterior)
  | 'pct_ytd' // índice: variación % acumulada vs diciembre anterior (precios, salarios)
  | 'ytd_avg_pct_yoy' // índice de actividad: acumulado del año vs igual tramo del año anterior (criterio INDEC EMAE/IPI)
  | 'diff_prev_pp' // tasas: diferencia en p.p. vs período anterior
  | 'diff_yoy_pp' // tasas: diferencia en p.p. interanual
  | 'diff_yoy_abs' // saldos: diferencia absoluta interanual
  | 'ytd_sum' // flujos: acumulado en el año
  | 'ytd_sum_pct_yoy' // flujos: acumulado del año vs igual tramo del año anterior (%)
  | 'sum_12m' // flujos: suma móvil 12 meses
  | 'sum_12m_pct_yoy' // flujos: suma móvil 12m vs 12m previos (%)
  | 'rebase_100'; // índice reescalado: período base = 100

export interface TransformInfo {
  id: TransformId;
  label: string;
  /** Unidad resultante dado la unidad original. */
  unit: (seriesUnit: string) => string;
  description: string;
}

export interface TransformedPoint {
  period: Period;
  value: number | null;
}
