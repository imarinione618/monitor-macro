/**
 * Relevamiento de dimensiones reales por endpoint → docs/catalogo-dimensiones.md.
 * Tablas chicas: completas. Tablas grandes: solo el período más reciente.
 * Sin fetchFilters: se muestra el catálogo completo de la API, no el subconjunto descargado.
 */
import { DATASETS } from '../core/datasets';
import { SERIES } from '../core/registry';
import type { DatasetConfig, DatasetId, SourceSpec } from '../core/types';
import type { IndecClient, Row } from './client';

/** Umbral de filas para descargar una tabla completa. */
export const FULL_TABLE_MAX_ROWS = 20000;
const MAX_VALUES = 80;

/** Combinaciones de dimensiones útiles para entender cómo se identifica una serie. */
const COMBOS: Partial<Record<DatasetId, string[][]>> = {
  'estimador-mensual-de-actividad-economica-nivel-general': [['tipo_de_indicador_descripcion', 'tipo_de_indicador']],
  'estimador-mensual-de-actividad-economica-sectores': [['codigo', 'descripcion'], ['tipo_de_indicador']],
  ipi_manufacturero: [['cuadro_web', 'serie', 'tipo_de_indicador', 'unidad_de_medida']],
  ipi_minero: [['cuadro_web', 'serie', 'tipo_de_indicador', 'unidad_de_medida']],
  ipc_nacional: [['clasificador', 'nivel'], ['tipo_de_indicador', 'tipo_de_indicador_descripcion']],
  valorizacion_canastas_cba_cbt: [['nivel', 'codigo', 'tipo_de_indicador', 'descripcion']],
  indice_salarios: [['nivel', 'codigo', 'descripcion'], ['tipo_de_indicador', 'tipo_de_indicador_descripcion']],
  icc_precios_construccion: [['clasificador', 'nivel'], ['tipo_de_indicador', 'tipo_de_indicador_descripcion']],
  sipm_precios_mayoristas: [['indicador', 'clasificador', 'nivel'], ['tipo_de_indicador', 'tipo_de_indicador_descripcion']],
  comercio_exterior_nomenclaturas: [['nombre_columna']],
};

export interface ColumnInfo {
  name: string;
  role: 'periodo' | 'valor' | 'signo' | 'observaciones' | 'dimension';
  distinct: number;
  nonNull: number;
  values: { value: string; count: number }[];
}

export interface DatasetDiscovery {
  id: DatasetId;
  path: string;
  title: string;
  totalRows: number;
  firstPeriod: string | null;
  lastPeriod: string | null;
  sample: string;
  sampleRows: number;
  columns: ColumnInfo[];
  combos: { cols: string[]; values: { value: string; count: number }[] }[];
  registrySeries: number;
  error?: string;
}

function periodFields(ds: DatasetConfig): string[] {
  const p = ds.period;
  if (p.kind === 'yearMonth') return [p.rawField, p.yearField, p.monthField];
  if (p.kind === 'yearQuarter') return [p.rawField, p.yearField, p.quarterField];
  if (p.kind === 'yearSemester') return [p.rawField, p.yearField, p.semesterField];
  return [];
}

function count(rows: Row[], cols: string[]): { value: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = cols.map((c) => (r[c] === null || r[c] === undefined ? '∅' : String(r[c]))).join(' · ');
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].map(([value, c]) => ({ value, count: c })).sort((a, b) => a.value.localeCompare(b.value, 'es', { numeric: true }));
}

export function analyzeRows(ds: DatasetConfig, rows: Row[]): { columns: ColumnInfo[]; combos: DatasetDiscovery['combos'] } {
  const pf = new Set(periodFields(ds));
  const names = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const columns: ColumnInfo[] = names.map((name) => {
    const vals = rows.map((r) => r[name]);
    const nonNull = vals.filter((v) => v !== null && v !== undefined).length;
    const numeric = vals.filter((v) => typeof v === 'number').length;
    const role: ColumnInfo['role'] = pf.has(name)
      ? 'periodo'
      : name.endsWith('_null')
        ? 'signo'
        : name === 'observaciones'
          ? 'observaciones'
          : numeric > 0 && numeric === nonNull && !/cod|codigo|nivel/i.test(name)
            ? 'valor'
            : 'dimension';
    const values = role === 'valor' || role === 'periodo' ? [] : count(rows, [name]);
    return { name, role, distinct: role === 'valor' ? new Set(vals).size : values.length, nonNull, values };
  });
  const combos = (COMBOS[ds.id] ?? []).filter((cols) => cols.every((c) => names.includes(c))).map((cols) => ({ cols, values: count(rows, cols) }));
  return { columns, combos };
}

export async function discoverDataset(client: IndecClient, ds: DatasetConfig, log: (m: string) => void = () => {}): Promise<DatasetDiscovery> {
  const out: DatasetDiscovery = {
    id: ds.id,
    path: ds.path,
    title: ds.title,
    totalRows: 0,
    firstPeriod: null,
    lastPeriod: null,
    sample: '',
    sampleRows: 0,
    columns: [],
    combos: [],
    registrySeries: SERIES.filter((s) => s.source.kind === 'api' && (s.source as SourceSpec).dataset === ds.id).length,
  };
  const pk = ds.primaryKey;
  const rawField = ds.period.kind === 'none' ? null : ds.period.rawField;
  const head = await client.getPage(ds.path, rawField ? { select: rawField, order: `${rawField}.asc` } : { order: pk.join(',') }, 0, 1);
  out.totalRows = head.range?.total ?? 0;
  if (rawField) {
    out.firstPeriod = head.rows[0] ? String(head.rows[0][rawField]) : null;
    const tail = await client.getPage(ds.path, { select: rawField, order: `${rawField}.desc` }, 0, 1);
    out.lastPeriod = tail.rows[0] ? String(tail.rows[0][rawField]) : null;
  }
  let rows: Row[];
  if (out.totalRows <= FULL_TABLE_MAX_ROWS || !rawField || !out.lastPeriod) {
    rows = (await client.fetchAll(ds.path, {}, pk)).rows;
    out.sample = 'tabla completa';
  } else {
    rows = (await client.fetchAll(ds.path, { [rawField]: `eq.${out.lastPeriod}` }, pk)).rows;
    out.sample = `solo el período más reciente (${rawField} = ${out.lastPeriod})`;
  }
  out.sampleRows = rows.length;
  log(`  ${ds.id}: ${out.totalRows} filas, ${out.firstPeriod ?? '—'} → ${out.lastPeriod ?? '—'}, muestra ${rows.length} (${out.sample})`);
  Object.assign(out, analyzeRows(ds, rows));
  return out;
}

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const fmt = (n: number) => n.toLocaleString('es-AR');

export function renderCatalog(items: DatasetDiscovery[], nomen: Record<string, Record<string, string>> | null, generatedAt: string): string {
  const L: string[] = [];
  L.push('# Catálogo de dimensiones — API INDEC');
  L.push('');
  L.push(`_Generado automáticamente por \`npm run data:discover\` el ${generatedAt} contra la API real. No editar a mano._`);
  L.push('');
  L.push(`Método: tablas de hasta ${fmt(FULL_TABLE_MAX_ROWS)} filas se relevan completas; las más grandes, solo en su período más reciente (los valores de dimensión de períodos anteriores pueden diferir). No se aplican los \`fetchFilters\` de \`src/core/datasets.ts\`. Las columnas \`*_null\` no están documentadas en el OpenAPI: contienen el signo convencional que explica un valor nulo (ver docs/api-auditoria.md).`);
  L.push('');
  L.push('| Endpoint | Filas totales | Primer período | Último período | Muestra | Series en el registro |');
  L.push('|---|---:|---|---|---|---:|');
  for (const d of items) L.push(`| \`${d.path}\` | ${fmt(d.totalRows)} | ${d.firstPeriod ?? '—'} | ${d.lastPeriod ?? '—'} | ${d.error ? `ERROR: ${esc(d.error)}` : `${esc(d.sample)} (${fmt(d.sampleRows)} filas)`} | ${d.registrySeries} |`);
  for (const d of items) {
    L.push('');
    L.push(`## ${d.title} — \`${d.path}\``);
    L.push('');
    if (d.error) {
      L.push(`Error al relevar: ${d.error}`);
      continue;
    }
    L.push(`Filas totales: ${fmt(d.totalRows)} · períodos ${d.firstPeriod ?? '—'} → ${d.lastPeriod ?? '—'} · muestra: ${d.sample} (${fmt(d.sampleRows)} filas).`);
    L.push('');
    L.push('| Columna | Rol | Valores distintos (muestra) | No nulos |');
    L.push('|---|---|---:|---:|');
    for (const c of d.columns) L.push(`| \`${c.name}\` | ${c.role} | ${c.role === 'periodo' ? '—' : fmt(c.distinct)} | ${fmt(c.nonNull)} |`);
    for (const combo of d.combos) {
      L.push('');
      L.push(`**Combinaciones ${combo.cols.map((c) => `\`${c}\``).join(' × ')}** (${combo.values.length}):`);
      L.push('');
      for (const v of combo.values.slice(0, MAX_VALUES)) L.push(`- ${esc(v.value)} — ${fmt(v.count)} filas`);
      if (combo.values.length > MAX_VALUES) L.push(`- … y ${combo.values.length - MAX_VALUES} más`);
    }
    for (const c of d.columns.filter((x) => x.role !== 'valor' && x.role !== 'periodo')) {
      if (d.combos.some((k) => k.cols.length === 1 && k.cols[0] === c.name)) continue;
      L.push('');
      L.push(`**\`${c.name}\`** (${c.role}, ${c.values.length} valores):`);
      L.push('');
      const dict = nomen?.[c.name];
      const vals = c.values.slice(0, MAX_VALUES).map((v) => {
        const label = v.value.length > 140 ? `${v.value.slice(0, 140)}…` : v.value;
        const desc = dict?.[v.value];
        return `\`${esc(label)}\`${desc ? ` (${esc(desc)})` : ''} [${fmt(v.count)}]`;
      });
      L.push(vals.join(' · '));
      if (c.values.length > MAX_VALUES) L.push(`… y ${c.values.length - MAX_VALUES} valores más.`);
    }
  }
  L.push('');
  return L.join('\n');
}

export async function discoverAll(client: IndecClient, ids: DatasetId[] = Object.keys(DATASETS) as DatasetId[], log: (m: string) => void = () => {}): Promise<DatasetDiscovery[]> {
  const out: DatasetDiscovery[] = [];
  for (const id of ids) {
    const ds = DATASETS[id];
    try {
      out.push(await discoverDataset(client, ds, log));
    } catch (e) {
      log(`  ${id}: ERROR ${(e as Error).message}`);
      out.push({ id, path: ds.path, title: ds.title, totalRows: 0, firstPeriod: null, lastPeriod: null, sample: '', sampleRows: 0, columns: [], combos: [], registrySeries: 0, error: (e as Error).message });
    }
  }
  return out;
}
