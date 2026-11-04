/**
 * PLAN DE DOCUMENTO (puro, sin E/S): qué pestañas, columnas y valores debe tener
 * cada uno de los 4 Google Sheets.
 *
 * Estructura de las pestañas de datos (DATOS_* y CALCULOS_*):
 *   fila 1  → IDs técnicos de columna: A1 = "fecha", resto = columnKey ("<serie>|<transformación>")
 *   fila 2  → encabezado legible ("Fecha", "EMAE desest. (Índice base 2004=100)")
 *   fila 3+ → una fila por período (ascendente, continuo), col. A = fecha real (serial)
 *
 * El orden de columnas existente se respeta: las claves ya presentes en la fila 1
 * conservan su posición, las nuevas se agregan al final y las que ya no están en el
 * registro se conservan (con sus valores) marcadas "[RETIRADA]".
 */
import { DATASETS } from '../core/datasets';
import { comparePeriods, makePeriod, periodRange, periodToSheetsSerial } from '../core/periods';
import { findSeries, seriesByTopic } from '../core/registry';
import { SA_LABELS, TRANSFORMS } from '../core/transforms';
import { buildWideTable, columnKey, defaultCalcTransforms, type ColumnSpec, type WideTable } from '../core/views';
import {
  FREQUENCY_LABELS,
  TOPIC_LABELS,
  type Frequency,
  type Measure,
  type Period,
  type SeriesData,
  type SeriesDef,
  type Topic,
  type TransformId,
} from '../core/types';
import { colLetter } from './a1';
import { isSyntheticSource, type DataSource } from './source';
import type { CellValue, Grid } from './types';

// ------------------------------------------------------------------ tipos

export type TabRole = 'leeme' | 'catalogo' | 'control' | 'datos' | 'calculos' | 'ejemplo' | 'usuario';

export interface DataColumn {
  /** columnKey (fila 1). '' = columna vacía heredada (se respeta la posición). */
  key: string;
  header: string;
  seriesId: string | null;
  transform: TransformId | null;
  retired: boolean;
}

export interface TabPlan {
  /** Clave estable (= título por defecto). Se guarda como developer metadata de la pestaña. */
  key: string;
  title: string;
  role: TabRole;
  grid: Grid;
  frozenRows: number;
  frozenCols: number;
  /** 'all': toda la pestaña es gestionada; 'columns': solo las columnas A..ancho de la grilla. */
  managedWidth: 'all' | 'columns';
  /** Solo se escribe al crearla (GRAFICOS_USUARIO). */
  createOnly?: boolean;
  frequency?: Frequency;
  /** columns[i] ↔ columna i+1 de la hoja (la 0 es la fecha). Solo datos/calculos. */
  columns?: DataColumn[];
  description: string;
}

export interface ChartPlan {
  title: string;
  dataTabKey: string;
  /** Índices de columna (0-based) en la pestaña de datos. */
  seriesColumns: number[];
  chartType: 'LINE' | 'COLUMN';
  yAxisTitle: string;
}

export interface TopicPlan {
  topic: Topic;
  title: string;
  tabs: TabPlan[];
  chart: ChartPlan | null;
  synthetic: boolean;
  staleSeries: string[];
  errorSeries: string[];
  retiredColumns: { tab: string; key: string }[];
  warnings: string[];
}

export interface PlanInput {
  topic: Topic;
  source: DataSource;
  now: Date;
  /** Series del tema (por defecto, el registro). Inyectable para tests. */
  defs?: SeriesDef[];
  /** Grillas actuales de pestañas DATOS/CALCULOS existentes, por clave de pestaña. */
  existing?: Map<string, Grid>;
  /** Pestañas gestionadas que existen en el documento pero ya no están en el plan. */
  orphanTabs?: string[];
  /** Modo de ejecución para informar en CONTROL. */
  runMode?: string;
}

// ------------------------------------------------------------------ constantes

export const TECH_DATE_KEY = 'fecha';
export const DATE_HEADER = 'Fecha';
export const RETIRED_PREFIX = '[RETIRADA] ';
export const HEADER_ROWS = 2;
export const USER_TAB = 'GRAFICOS_USUARIO';
export const EXAMPLE_TAB = 'EJEMPLO_GRAFICO';

export function documentTitle(topic: Topic): string {
  return `Argentina — ${TOPIC_LABELS[topic]}`;
}

export function dataTabKey(family: string, freq: Frequency): string {
  return `DATOS_${family.toUpperCase()}_${freq}`;
}
export function calcTabKey(family: string, freq: Frequency): string {
  return `CALCULOS_${family.toUpperCase()}_${freq}`;
}

/** Prefijos/nombres reservados para pestañas gestionadas. */
export const MANAGED_PREFIXES = ['LEEME', 'CATALOGO', 'CONTROL', 'DATOS_', 'CALCULOS_', EXAMPLE_TAB];

const MEASURE_LABELS: Record<Measure, string> = {
  index: 'Índice',
  rate: 'Tasa (%)',
  flow: 'Flujo',
  balance: 'Saldo',
  price_level: 'Valor monetario',
  published_change: 'Variación publicada',
  weight: 'Ponderación',
  incidence: 'Incidencia publicada',
};

/** Formato de número de fecha por frecuencia (la fecha es el primer día del período). */
export const DATE_PATTERN: Record<Frequency, string> = {
  M: 'mmm yyyy',
  Q: 'mmm yyyy',
  S: 'mmm yyyy',
  A: 'yyyy',
};

// ------------------------------------------------------------------ fechas

const SERIAL_EPOCH = Date.UTC(1899, 11, 30);

/** Serial de Sheets → período canónico de la frecuencia dada. */
export function serialToPeriod(serial: number, freq: Frequency): Period {
  const d = new Date(SERIAL_EPOCH + Math.round(serial) * 86400000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  switch (freq) {
    case 'M':
      return makePeriod(y, m, 'M');
    case 'Q':
      return makePeriod(y, Math.ceil(m / 3), 'Q');
    case 'S':
      return makePeriod(y, m <= 6 ? 1 : 2, 'S');
    case 'A':
      return makePeriod(y, 1, 'A');
  }
}

/** "04/11/2026 10:30:00" en hora de Buenos Aires. */
export function formatBA(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return String(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// ------------------------------------------------------------------ tablas de datos

interface ColumnValues {
  col: DataColumn;
  values: Map<Period, number | null>;
}

/**
 * Combina el orden de columnas existente (fila 1 de la hoja) con las columnas
 * deseadas: conserva posiciones, agrega nuevas al final, marca retiradas.
 */
export function mergeColumns(
  table: WideTable,
  existing: Grid | undefined,
): { cols: ColumnValues[]; extraPeriods: Period[] } {
  const freq = table.frequency;
  const wanted = new Map(table.columns.map((c, i) => [c.key, i]));
  const tableValues = (i: number): Map<Period, number | null> =>
    new Map(table.periods.map((p, r) => [p, num(table.values[i]![r])]));
  const used = new Set<string>();
  const out: ColumnValues[] = [];
  const extraPeriods: Period[] = [];

  const row1 = existing?.[0] ?? [];
  const row2 = existing?.[1] ?? [];
  const isOurs = row1[0] === TECH_DATE_KEY;
  const existingKeys = isOurs ? row1.slice(1).map((v) => (typeof v === 'string' ? v.trim() : '')) : [];

  existingKeys.forEach((key, i) => {
    const idx = key && !used.has(key) ? wanted.get(key) : undefined;
    if (idx !== undefined) {
      const c = table.columns[idx]!;
      used.add(key);
      out.push({ col: { key, header: c.header, seriesId: c.seriesId, transform: c.transform, retired: false }, values: tableValues(idx) });
      return;
    }
    if (!key || used.has(key)) {
      out.push({ col: { key: '', header: '', seriesId: null, transform: null, retired: false }, values: new Map() });
      return;
    }
    // Retirada: conservar encabezado y valores existentes, alineados por fecha.
    used.add(key);
    const oldHeader = typeof row2[i + 1] === 'string' ? String(row2[i + 1]) : key;
    const values = new Map<Period, number | null>();
    for (let r = HEADER_ROWS; r < (existing?.length ?? 0); r++) {
      const row = existing![r] ?? [];
      const serial = row[0];
      if (typeof serial !== 'number') continue;
      const v = row[i + 1];
      if (typeof v !== 'number') continue;
      const p = serialToPeriod(serial, freq);
      values.set(p, v);
      extraPeriods.push(p);
    }
    const [sid, t] = key.split('|');
    out.push({
      col: {
        key,
        header: oldHeader.startsWith(RETIRED_PREFIX) ? oldHeader : RETIRED_PREFIX + oldHeader,
        seriesId: sid ?? null,
        transform: (t as TransformId) ?? null,
        retired: true,
      },
      values,
    });
  });

  table.columns.forEach((c, i) => {
    if (used.has(c.key)) return;
    used.add(c.key);
    out.push({ col: { key: c.key, header: c.header, seriesId: c.seriesId, transform: c.transform, retired: false }, values: tableValues(i) });
  });
  return { cols: out, extraPeriods };
}

/** Grilla de una pestaña de datos a partir de una tabla ancha (y el estado existente). */
export function buildDataGrid(table: WideTable, existing: Grid | undefined): { grid: Grid; columns: DataColumn[] } {
  const { cols, extraPeriods } = mergeColumns(table, existing);
  let periods = table.periods;
  if (extraPeriods.length) {
    const all = [...table.periods, ...extraPeriods].sort(comparePeriods);
    periods = periodRange(all[0]!, all.at(-1)!);
  }
  const grid: Grid = [
    [TECH_DATE_KEY, ...cols.map((c) => c.col.key)],
    [DATE_HEADER, ...cols.map((c) => c.col.header)],
  ];
  for (const p of periods) grid.push([periodToSheetsSerial(p), ...cols.map((c) => c.values.get(p) ?? null)]);
  return { grid, columns: cols.map((c) => c.col) };
}

// ------------------------------------------------------------------ plan

interface Group {
  family: string;
  freq: Frequency;
  defs: SeriesDef[];
}

function groupDefs(defs: SeriesDef[]): Group[] {
  const groups = new Map<string, Group>();
  for (const d of defs) {
    const k = `${d.family}|${d.frequency}`;
    if (!groups.has(k)) groups.set(k, { family: d.family, freq: d.frequency, defs: [] });
    groups.get(k)!.defs.push(d);
  }
  return [...groups.values()];
}

const EXAMPLE_CHARTS: Record<Topic, { tab: string; keys: string[]; type: 'LINE' | 'COLUMN'; title: string; y: string }> = {
  actividad: {
    tab: dataTabKey('emae', 'M'),
    keys: ['actividad.emae.total.sa|level'],
    type: 'LINE',
    title: 'EMAE desestacionalizado — Índice base 2004=100',
    y: 'Índice 2004=100',
  },
  laboral: {
    tab: dataTabKey('eph_tasas', 'Q'),
    keys: ['laboral.eph.desocupacion|level'],
    type: 'LINE',
    title: 'Tasa de desocupación — EPH, 31 aglomerados urbanos (%)',
    y: '%',
  },
  precios: {
    tab: calcTabKey('ipc_nivel_general', 'M'),
    keys: ['precios.ipc.ng.nacional|pct_prev'],
    type: 'COLUMN',
    title: 'IPC nacional — Variación % mensual',
    y: '%',
  },
  comex: {
    tab: dataTabKey('comercio_totales', 'M'),
    keys: ['comex.expo.total|level', 'comex.impo.total|level'],
    type: 'LINE',
    title: 'Exportaciones (FOB) e importaciones (CIF) — Millones de USD',
    y: 'Millones de USD',
  },
};

export function planTopic(input: PlanInput): TopicPlan {
  const { topic, source, now } = input;
  const defs = input.defs ?? seriesByTopic(topic);
  const byId = new Map(defs.map((d) => [d.id, d]));
  const getDef = (id: string): SeriesDef => {
    const d = byId.get(id) ?? findSeries(id);
    if (!d) throw new Error(`Serie desconocida: ${id}`);
    return d;
  };
  const getData = (id: string): SeriesData | null => source.getData(id);
  const warnings: string[] = [];

  const synthetic = isSyntheticSource(source, defs.map((d) => d.id));
  const staleSeries = defs
    .filter((d) => source.manifest?.series[d.id]?.stale || getData(d.id)?.meta.stale)
    .map((d) => d.id);
  const errorSeries = defs.filter((d) => source.manifest?.series[d.id]?.error).map((d) => d.id);

  // -------- DATOS / CALCULOS
  const dataTabs: TabPlan[] = [];
  const calcTabs: TabPlan[] = [];
  const seriesLocation = new Map<string, { dataTab: string; dataCol: string; calcTab: string | null; calcTransforms: TransformId[] }>();
  const retiredColumns: { tab: string; key: string }[] = [];

  for (const g of groupDefs(defs)) {
    const dKey = dataTabKey(g.family, g.freq);
    const levelCols: ColumnSpec[] = g.defs.map((d) => ({ seriesId: d.id, transform: 'level' }));
    const dTable = buildWideTable(levelCols, getDef, getData);
    const dBuilt = buildDataGrid(dTable, input.existing?.get(dKey));
    dataTabs.push({
      key: dKey,
      title: dKey,
      role: 'datos',
      grid: dBuilt.grid,
      frozenRows: HEADER_ROWS,
      frozenCols: 1,
      managedWidth: 'columns',
      frequency: g.freq,
      columns: dBuilt.columns,
      description: `${g.family} — ${FREQUENCY_LABELS[g.freq].toLowerCase()}: valores publicados (nivel), una serie por columna.`,
    });
    for (const c of dBuilt.columns.filter((c) => c.retired)) retiredColumns.push({ tab: dKey, key: c.key });

    const calcCols: ColumnSpec[] = g.defs.flatMap((d) => defaultCalcTransforms(d).map((t) => ({ seriesId: d.id, transform: t })));
    let cKey: string | null = null;
    if (calcCols.length) {
      cKey = calcTabKey(g.family, g.freq);
      const cTable = buildWideTable(calcCols, getDef, getData);
      const cBuilt = buildDataGrid(cTable, input.existing?.get(cKey));
      calcTabs.push({
        key: cKey,
        title: cKey,
        role: 'calculos',
        grid: cBuilt.grid,
        frozenRows: HEADER_ROWS,
        frozenCols: 1,
        managedWidth: 'columns',
        frequency: g.freq,
        columns: cBuilt.columns,
        description: `${g.family} — ${FREQUENCY_LABELS[g.freq].toLowerCase()}: transformaciones calculadas (mismos valores que el dashboard).`,
      });
      for (const c of cBuilt.columns.filter((c) => c.retired)) retiredColumns.push({ tab: cKey, key: c.key });
    }
    for (const d of g.defs) {
      const idx = dBuilt.columns.findIndex((c) => c.key === columnKey({ seriesId: d.id, transform: 'level' }));
      seriesLocation.set(d.id, {
        dataTab: dKey,
        dataCol: idx >= 0 ? colLetter(idx + 1) : '',
        calcTab: cKey && defaultCalcTransforms(d).length ? cKey : null,
        calcTransforms: defaultCalcTransforms(d),
      });
    }
  }

  // -------- gráfico de ejemplo
  let chart: ChartPlan | null = null;
  {
    const spec = EXAMPLE_CHARTS[topic];
    const tabKey = spec.tab;
    const tab = [...dataTabs, ...calcTabs].find((t) => t.key === tabKey);
    const cols = spec.keys.map((k) => (tab?.columns ?? []).findIndex((c) => c.key === k));
    if (!tab || cols.some((c) => c < 0)) {
      warnings.push(`Gráfico de ejemplo omitido: no se encontró ${tabKey} con ${spec.keys.join(', ')}.`);
    } else {
      chart = { title: spec.title, dataTabKey: tabKey, seriesColumns: cols.map((c) => c + 1), chartType: spec.type, yAxisTitle: spec.y };
    }
  }

  const allDataTabs = [...dataTabs, ...calcTabs];
  const catalogo = buildCatalogo(defs, seriesLocation);
  const control = buildControl({ input, defs, synthetic, staleSeries, errorSeries, retiredColumns, tabs: allDataTabs, warnings });
  const leeme = buildLeeme(topic, allDataTabs, synthetic, staleSeries, chart);

  const tabs: TabPlan[] = [
    { key: 'LEEME', title: 'LEEME', role: 'leeme', grid: leeme, frozenRows: 0, frozenCols: 0, managedWidth: 'all', description: 'Guía de uso del documento.' },
    {
      key: 'CATALOGO',
      title: 'CATALOGO',
      role: 'catalogo',
      grid: catalogo,
      frozenRows: 1,
      frozenCols: 1,
      managedWidth: 'all',
      description: 'Ficha de cada serie: IDs, selector oficial, unidad, base, ajuste, geografía, fuente, notas, estado.',
    },
    {
      key: 'CONTROL',
      title: 'CONTROL',
      role: 'control',
      grid: control,
      frozenRows: 0,
      frozenCols: 0,
      managedWidth: 'all',
      description: 'Última ejecución, modo de datos, cobertura por serie, revisiones recientes.',
    },
    ...allDataTabs,
    {
      key: EXAMPLE_TAB,
      title: EXAMPLE_TAB,
      role: 'ejemplo',
      grid: buildExampleGrid(chart),
      frozenRows: 0,
      frozenCols: 0,
      managedWidth: 'all',
      description: 'Gráfico de ejemplo gestionado (verifica fechas, valores y actualización).',
    },
    {
      key: USER_TAB,
      title: USER_TAB,
      role: 'usuario',
      grid: [
        ['Espacio del usuario. Esta pestaña se crea una sola vez y la sincronización NUNCA la modifica.'],
        ['Creá acá tus gráficos y notas apuntando a rangos de las pestañas DATOS_* / CALCULOS_* (p.ej. A2:A y C2:C).'],
      ],
      frozenRows: 0,
      frozenCols: 0,
      managedWidth: 'all',
      createOnly: true,
      description: 'Pestaña libre del usuario (nunca se modifica).',
    },
  ];

  return {
    topic,
    title: documentTitle(topic),
    tabs,
    chart,
    synthetic,
    staleSeries,
    errorSeries,
    retiredColumns,
    warnings,
  };
}

// ------------------------------------------------------------------ CATALOGO

export const CATALOGO_HEADERS = [
  'ID serie',
  'Nombre',
  'Nombre corto',
  'Familia',
  'Frecuencia',
  'Medida',
  'Unidad',
  'Base',
  'Ajuste estacional',
  'Geografía',
  'Cobertura',
  'Moneda / valuación',
  'Fuente',
  'Organismo productor',
  'Endpoint API',
  'Selector oficial (columna = valor)',
  'Campo de valor',
  'Agregación / escala',
  'Metodología',
  'Notas',
  'Estado',
  'Prioridad',
  'Pestaña DATOS',
  'Columna DATOS',
  'Clave de columna (fila 1)',
  'Pestaña CALCULOS',
  'Transformaciones en CALCULOS',
];

function buildCatalogo(
  defs: SeriesDef[],
  loc: Map<string, { dataTab: string; dataCol: string; calcTab: string | null; calcTransforms: TransformId[] }>,
): Grid {
  const rows: Grid = [CATALOGO_HEADERS];
  for (const d of defs) {
    const l = loc.get(d.id);
    let fuente = '';
    let productor = '';
    let endpoint = '';
    let selector = '';
    let valueField = '';
    let agg = '';
    let metodologia = '';
    if (d.source.kind === 'api') {
      const ds = DATASETS[d.source.dataset];
      fuente = `INDEC — ${ds?.title ?? d.source.dataset}`;
      productor = ds?.producer ?? '';
      endpoint = ds?.path ?? d.source.dataset;
      selector = Object.entries(d.source.selector)
        .map(([k, v]) => `${k} = ${v}`)
        .join('; ') || '(todas las filas)';
      valueField = d.source.valueField ?? 'valor';
      agg = [d.source.aggregate === 'sum' ? 'suma de filas por período' : '', d.source.scaleFactor ? `escala × ${d.source.scaleFactor}` : '']
        .filter(Boolean)
        .join('; ');
      metodologia = ds?.methodologyUrl ?? '';
    } else {
      const op = d.source.op;
      fuente = 'Cálculo propio a partir de series INDEC del registro';
      endpoint = '—';
      selector =
        op.type === 'difference'
          ? `diferencia: ${op.minuend} − ${op.subtrahend}`
          : op.type === 'real_index'
            ? `índice real: ${op.nominal} / ${op.deflator}, base ${op.basePeriod} = 100`
            : `suma: ${op.inputs.join(' + ')}`;
    }
    rows.push([
      d.id,
      d.name,
      d.shortName,
      d.family,
      FREQUENCY_LABELS[d.frequency],
      MEASURE_LABELS[d.measure],
      d.unit,
      d.base ?? '',
      SA_LABELS[d.seasonalAdjustment],
      d.geography,
      d.coverage ?? '',
      d.currency ?? '',
      fuente,
      productor,
      endpoint,
      selector,
      valueField,
      agg,
      metodologia,
      (d.notes ?? []).join(' | '),
      d.status,
      d.priority,
      l?.dataTab ?? '',
      l?.dataCol ?? '',
      columnKey({ seriesId: d.id, transform: 'level' }),
      l?.calcTab ?? '',
      (l?.calcTransforms ?? []).map((t) => `${t} (${TRANSFORMS[t].label})`).join('; '),
    ]);
  }
  return rows;
}

// ------------------------------------------------------------------ CONTROL

function buildControl(a: {
  input: PlanInput;
  defs: SeriesDef[];
  synthetic: boolean;
  staleSeries: string[];
  errorSeries: string[];
  retiredColumns: { tab: string; key: string }[];
  tabs: TabPlan[];
  warnings: string[];
}): Grid {
  const { input, defs, synthetic, staleSeries, errorSeries } = a;
  const m = input.source.manifest;
  const rows: Grid = [];
  const blank = () => rows.push([]);

  rows.push(['CONTROL — estado de la sincronización']);
  rows.push(['Sincronizado (Buenos Aires)', formatBA(input.now)]);
  rows.push(['Sincronizado (ISO UTC)', input.now.toISOString()]);
  rows.push(['Modo de ejecución', input.runMode ?? 'sync']);
  rows.push([
    'Modo de datos',
    synthetic ? 'SINTÉTICO — DATOS INVENTADOS PARA DESARROLLO, NO SON DATOS REALES' : (m?.dataMode ?? 'desconocido'),
  ]);
  rows.push(['Store', input.source.label]);
  rows.push(['Manifest generado', m?.generatedAt ? `${formatBA(m.generatedAt)} (${m.generatedAt})` : 'sin manifest']);
  if (m?.lastRun) {
    rows.push(['Última ingesta (runId)', m.lastRun.runId]);
    rows.push(['Última ingesta — inicio', formatBA(m.lastRun.startedAt)]);
    rows.push(['Última ingesta — fin', formatBA(m.lastRun.finishedAt)]);
    rows.push(['Última ingesta — resultado', m.lastRun.ok ? (m.lastRun.partial ? 'OK parcial' : 'OK') : 'CON ERRORES']);
  } else rows.push(['Última ingesta', 'sin registro']);
  rows.push(['Series del documento', defs.length]);
  rows.push(['Series desactualizadas (stale)', staleSeries.length ? `${staleSeries.length}: ${staleSeries.join(', ')}` : 0]);
  rows.push(['Series con error', errorSeries.length ? `${errorSeries.length}: ${errorSeries.join(', ')}` : 0]);
  rows.push(['Columnas retiradas', a.retiredColumns.length ? a.retiredColumns.map((r) => `${r.tab}:${r.key}`).join('; ') : 0]);
  rows.push(['Pestañas gestionadas huérfanas', input.orphanTabs?.length ? input.orphanTabs.join(', ') : 0]);
  for (const w of a.warnings) rows.push(['Aviso', w]);
  blank();

  // Datasets
  const datasets = new Set(defs.flatMap((d) => (d.source.kind === 'api' ? [d.source.dataset] : [])));
  rows.push(['DATASETS (endpoints)']);
  rows.push(['Dataset', 'OK', 'Última consulta exitosa', 'Último intento', 'Filas', 'Modo', 'Error']);
  for (const ds of datasets) {
    const st = m?.datasets[ds];
    rows.push([
      ds,
      st ? (st.ok ? 'sí' : 'NO') : 'sin dato',
      formatBA(st?.lastSuccessAt),
      formatBA(st?.lastAttemptAt),
      st?.rowsFetched ?? null,
      st?.mode ?? '',
      st?.error ? `${st.error.kind}${st.error.httpStatus ? ` (${st.error.httpStatus})` : ''}: ${st.error.message}` : '',
    ]);
  }
  blank();

  // Cobertura por serie
  rows.push(['COBERTURA POR SERIE']);
  rows.push(['ID serie', 'Nombre corto', 'Frecuencia', 'Primer período', 'Último período', 'Filas (store)', 'Valores no nulos', 'Consultado (BA)', 'Stale', 'Error', 'Estado registro', 'Sintético']);
  for (const d of defs) {
    const data = input.source.getData(d.id);
    const ms = m?.series[d.id];
    const obs = data?.observations ?? [];
    rows.push([
      d.id,
      d.shortName,
      FREQUENCY_LABELS[d.frequency],
      data?.meta.firstPeriod ?? ms?.firstPeriod ?? '',
      data?.meta.lastPeriod ?? ms?.lastPeriod ?? '',
      data ? obs.length : (ms?.count ?? 0),
      obs.filter((o) => o.value !== null).length,
      formatBA(data?.meta.retrievedAt ?? ms?.retrievedAt ?? null),
      ms?.stale || data?.meta.stale ? 'SÍ' : 'no',
      ms?.error ?? (data ? '' : 'sin datos en el store'),
      d.status,
      data?.meta.synthetic ? 'SÍ' : 'no',
    ]);
  }
  blank();

  // Revisiones recientes
  const ids = new Set(defs.map((d) => d.id));
  const revs = input.source.revisions
    .filter((r) => ids.has(r.seriesId))
    .sort((x, y) => (x.detectedAt < y.detectedAt ? 1 : x.detectedAt > y.detectedAt ? -1 : 0))
    .slice(0, 100);
  rows.push(['REVISIONES RECIENTES (últimas 100)']);
  rows.push(['Detectada (BA)', 'ID serie', 'Período', 'Valor anterior', 'Valor nuevo', 'Tipo', 'runId']);
  if (!revs.length) rows.push(['sin revisiones registradas']);
  for (const r of revs) rows.push([formatBA(r.detectedAt), r.seriesId, r.period, r.oldValue, r.newValue, r.kind, r.runId]);
  blank();

  rows.push(['PESTAÑAS DE DATOS']);
  rows.push(['Pestaña', 'Tipo', 'Columnas', 'Filas de datos', 'Primera fecha', 'Última fecha']);
  for (const t of a.tabs) {
    const data = t.grid.slice(HEADER_ROWS);
    rows.push([
      t.title,
      t.role === 'datos' ? 'DATOS' : 'CALCULOS',
      (t.columns ?? []).length,
      data.length,
      data.length && t.frequency ? serialToPeriod(data[0]![0] as number, t.frequency) : '',
      data.length && t.frequency ? serialToPeriod(data.at(-1)![0] as number, t.frequency) : '',
    ]);
  }
  return rows;
}

// ------------------------------------------------------------------ LEEME

function buildLeeme(topic: Topic, dataTabs: TabPlan[], synthetic: boolean, stale: string[], chart: ChartPlan | null): Grid {
  const rows: Grid = [];
  const add = (a: CellValue, b: CellValue = '') => rows.push(b === '' ? [a] : [a, b]);
  add(documentTitle(topic));
  add('Monitor macroeconómico de Argentina con datos oficiales del INDEC (Catálogo API-INDEC).');
  if (synthetic) {
    add('⚠ ATENCIÓN', 'Este documento contiene DATOS SINTÉTICOS (inventados para desarrollo). NO son datos reales del INDEC. No usar para análisis.');
  }
  if (stale.length) {
    add('⚠ Datos desactualizados', `${stale.length} serie(s) no pudieron actualizarse en la última corrida y muestran datos anteriores. Ver CONTROL.`);
  }
  rows.push([]);
  add('CONTENIDO');
  add('LEEME', 'Esta guía.');
  add('CATALOGO', 'Ficha de cada serie: ID estable, nombre, selector oficial de la API, unidad, base, ajuste estacional, geografía, fuente, metodología, notas y estado.');
  add('CONTROL', 'Última sincronización, modo de datos (real/sintético), cobertura por serie (primer/último período, filas), series desactualizadas o con error, revisiones recientes.');
  for (const t of dataTabs) add(t.title, t.description);
  add(EXAMPLE_TAB, chart ? `Gráfico de ejemplo gestionado: ${chart.title} (fuente: ${chart.dataTabKey}).` : 'Gráfico de ejemplo gestionado.');
  add(USER_TAB, 'Espacio libre del usuario: se crea una vez y el sistema nunca lo modifica.');
  rows.push([]);
  add('CÓMO USAR / GRAFICAR');
  add('Estructura de DATOS_* y CALCULOS_*', 'Fila 1 = ID técnico de columna (no editar), fila 2 = encabezado legible, desde la fila 3 = un período por fila, en orden ascendente.');
  add('Fechas', 'La columna A es una fecha real (número de serie con formato de fecha) igual al PRIMER DÍA del período: ene 2024 = enero 2024; abr 2024 en una pestaña _Q = 2.º trimestre 2024; jul 2024 en _S = 2.º semestre.');
  add('Graficar', 'Seleccioná la columna A y la(s) serie(s) desde la fila 2 hacia abajo (p.ej. A2:A y C2:C) e insertá un gráfico; usá rangos abiertos (A2:A) para que tome los períodos nuevos automáticamente.');
  add('Frecuencias', 'Mensual (_M), trimestral (_Q) y semestral (_S) están en pestañas separadas: no mezclar en un mismo gráfico.');
  add('Tus gráficos y notas', `Hacelos en ${USER_TAB} o en pestañas propias con otro nombre. Los gráficos que apuntan a DATOS_*/CALCULOS_* se actualizan solos.`);
  rows.push([]);
  add('ACTUALIZACIÓN');
  add('Comando', '`npm run update` (descarga INDEC + sincroniza Sheets) o `npm run sheets:sync` (solo Sheets). Corre de forma programada una vez por día.');
  add('Qué se reescribe', 'Solo las pestañas gestionadas: LEEME, CATALOGO, CONTROL, DATOS_*, CALCULOS_*, EJEMPLO_GRAFICO (identificadas con metadatos de desarrollador). Todo lo que escribas en ellas se sobrescribe.');
  add('Qué se conserva', 'Pestañas propias, GRAFICOS_USUARIO, gráficos (incluso los ubicados en pestañas gestionadas), notas de celda, IDs de pestañas (sheetId) y el orden de columnas.');
  add('Series nuevas / retiradas', 'Las series nuevas se agregan al final de la tabla. Las retiradas del registro no se borran: quedan con el prefijo "[RETIRADA]" y sus últimos valores.');
  add('Revisiones', 'El INDEC revisa datos históricos (p.ej. series desestacionalizadas): cada sincronización reescribe la historia completa con los últimos valores publicados. Ver CONTROL → revisiones.');
  rows.push([]);
  add('CONVENCIONES');
  add('Faltantes', 'Celda vacía = dato no publicado o no disponible (nunca 0). No se interpola ni se arrastra.');
  add('Precisión', 'Valores sin redondear (el formato visible usa 2 decimales). Los valores de CALCULOS_* son exactamente los del dashboard.');
  add('Transformaciones', 'Índices y flujos → variaciones %; tasas → diferencias en puntos porcentuales (p.p.); saldos → diferencias absolutas. Comparaciones por calendario.');
  add('Ajuste estacional', 'La variación vs período anterior en actividad solo se calcula sobre series desestacionalizadas. No se desestacionaliza en forma propia.');
  if (topic === 'laboral') add('EPH', 'Las tasas de la EPH corresponden a 31 aglomerados urbanos, no al total nacional.');
  if (topic === 'comex') add('Comercio exterior', 'Valores en millones de USD corrientes (no volúmenes). Exportaciones FOB, importaciones CIF. Saldo = X FOB − M CIF.');
  if (topic === 'precios') add('IPC', 'La variación mensual de la serie original del IPC es la medida oficial de inflación. Incidencias: usar las publicadas.');
  add('Unidades', 'Cada encabezado de la fila 2 indica la unidad entre paréntesis. Detalle en CATALOGO.');
  add('Fuente', 'INDEC — Catálogo API-INDEC (https://api.indec.gob.ar). Cálculos propios indicados como tales en CATALOGO.');
  return rows;
}

function buildExampleGrid(chart: ChartPlan | null): Grid {
  if (!chart) return [['Gráfico de ejemplo no disponible (ver CONTROL → Aviso).']];
  const cols = chart.seriesColumns.map((c) => colLetter(c)).join(', ');
  return [
    [`Gráfico de ejemplo (gestionado por el sistema): ${chart.title}`],
    [`Fuente: pestaña ${chart.dataTabKey}, columna A (fecha) y columna(s) ${cols}, rangos abiertos desde la fila 2. Se actualiza solo en cada sincronización.`],
    [`No edites esta pestaña; para tus gráficos usá ${USER_TAB}.`],
  ];
}

/** Total de celdas de un plan (para validar el límite de 10 M celdas por libro). */
export function planCellCount(plan: TopicPlan): number {
  return plan.tabs.reduce((acc, t) => acc + t.grid.length * Math.max(1, t.grid.reduce((w, r) => Math.max(w, r.length), 0)), 0);
}
