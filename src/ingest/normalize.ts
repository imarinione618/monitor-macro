/**
 * Normalización: filas crudas de la API → Observation[] por serie del registro.
 *
 *  - Período canónico desde la columna cruda (AAAAMM, "20162T", "20261S") verificado
 *    contra las columnas de año/mes/trimestre/semestre.
 *  - Valor desde `valueField` (default "valor"); faltante = null (nunca 0).
 *  - Signos convencionales desde la columna NO documentada `<valueField>_null`
 *    ("///", "s", "-", ...) y desde `observaciones` ("* Dato provisorio", ...).
 *  - Duplicados (misma serie + período más de una vez sin agregación) → error de datos.
 *  - Selector que no coincide con ninguna fila → error de datos.
 *  - Se recortan los nulos al inicio y al final de la serie (períodos en que la serie
 *    no existe, p.ej. "///" antes del período base); los nulos intermedios se conservan.
 */
import type { DatasetConfig, DerivedSpec, Observation, ObservationFlag, Period, SeriesDef, SourceSpec } from '../core/types';
import { comparePeriods, fromEphQuarter, fromEphSemester, fromYYYYMM, isValidPeriod } from '../core/periods';
import { differenceSeries, ipcContribution, realIndex, toMap } from '../core/transforms';
import { IngestError } from './errors';
import type { Row } from './client';

// ------------------------------------------------------------------ signos

/** Signos convencionales del INDEC → ObservationFlag. */
export const SIGN_FLAGS: Record<string, ObservationFlag> = {
  '*': 'provisorio',
  '**': 'preliminar',
  e: 'estimado',
  i: 'imputado',
  u: 'calidad_inferior',
  '-': 'cero_absoluto',
  '.': 'no_registrado',
  '...': 'no_disponible',
  '///': 'no_corresponde',
  s: 'confidencial',
};

/** Signo de la columna `<col>_null` → flags. Devuelve también si el signo es desconocido. */
export function flagsFromSign(sign: unknown): { flags: ObservationFlag[]; unknown?: string } {
  if (sign === null || sign === undefined) return { flags: [] };
  const s = String(sign).trim();
  if (!s) return { flags: [] };
  const f = SIGN_FLAGS[s] ?? SIGN_FLAGS[s.toLowerCase()];
  return f ? { flags: [f] } : { flags: [], unknown: s };
}

/** Flags deducibles del texto de `observaciones` (p.ej. "* Dato provisorio", "Dato provisorio"). */
export function flagsFromNote(note: unknown): ObservationFlag[] {
  if (note === null || note === undefined) return [];
  const s = String(note).trim();
  if (!s) return [];
  const out = new Set<ObservationFlag>();
  if (/^\*\*/.test(s) || /\bpreliminar/i.test(s)) out.add('preliminar');
  else if (/^\*(?!\*)/.test(s) || /\bprovisori/i.test(s)) out.add('provisorio');
  if (/\bestimad/i.test(s)) out.add('estimado');
  if (/\bimputad/i.test(s)) out.add('imputado');
  return [...out];
}

function noteText(note: unknown): string | undefined {
  if (note === null || note === undefined) return undefined;
  const s = String(note).trim();
  return s ? s : undefined;
}

// ------------------------------------------------------------------ períodos

function intOf(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

/** Período canónico de una fila según la configuración del dataset (con verificación de coherencia). */
export function rowPeriod(ds: DatasetConfig, row: Row): Period {
  const pc = ds.period;
  const bad = (msg: string): never => {
    throw new IngestError('data', `${ds.id}: ${msg} (fila ${JSON.stringify(row).slice(0, 200)})`);
  };
  switch (pc.kind) {
    case 'yearMonth': {
      const raw = row[pc.rawField];
      let p: Period;
      try {
        p = fromYYYYMM(String(raw));
      } catch (e) {
        return bad((e as Error).message);
      }
      const y = intOf(row[pc.yearField]), m = intOf(row[pc.monthField]);
      if (y !== null && m !== null && p !== `${y}-${String(m).padStart(2, '0')}`) bad(`período ${String(raw)} incoherente con ${pc.yearField}=${y} ${pc.monthField}=${m}`);
      return p;
    }
    case 'yearQuarter': {
      const raw = row[pc.rawField];
      let p: Period;
      try {
        p = fromEphQuarter(String(raw));
      } catch (e) {
        return bad((e as Error).message);
      }
      const y = intOf(row[pc.yearField]), q = intOf(row[pc.quarterField]);
      if (y !== null && q !== null && p !== `${y}-Q${q}`) bad(`período ${String(raw)} incoherente con ${pc.yearField}=${y} ${pc.quarterField}=${q}`);
      return p;
    }
    case 'yearSemester': {
      const raw = row[pc.rawField];
      let p: Period;
      try {
        p = fromEphSemester(String(raw));
      } catch (e) {
        return bad((e as Error).message);
      }
      const y = intOf(row[pc.yearField]), s = intOf(row[pc.semesterField]);
      if (y !== null && s !== null && p !== `${y}-S${s}`) bad(`período ${String(raw)} incoherente con ${pc.yearField}=${y} ${pc.semesterField}=${s}`);
      return p;
    }
    case 'none':
      throw new IngestError('config', `${ds.id}: dataset sin períodos`);
  }
}

export interface IndexedRow {
  row: Row;
  period: Period;
}

/** Calcula el período de cada fila una sola vez (los errores de período abortan el dataset). */
export function indexRows(ds: DatasetConfig, rows: Row[]): IndexedRow[] {
  return rows.map((row) => ({ row, period: rowPeriod(ds, row) }));
}

// ------------------------------------------------------------------ selección y valores

export function matchesSelector(row: Row, selector: Record<string, string | number>): boolean {
  for (const k in selector) {
    const v = row[k];
    if (v === null || v === undefined || String(v) !== String(selector[k])) return false;
  }
  return true;
}

function parseValue(v: unknown, ctx: string): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new IngestError('data', `Valor no finito en ${ctx}`);
    return v;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return null;
    const n = Number(s);
    if (!Number.isFinite(n)) throw new IngestError('data', `Valor no numérico "${s.slice(0, 30)}" en ${ctx}`);
    return n;
  }
  throw new IngestError('data', `Valor de tipo inesperado (${typeof v}) en ${ctx}`);
}

export interface SeriesBuild {
  id: string;
  observations: Observation[];
  /** Filas de la API que coincidieron con el selector. */
  matchedRows: number;
  /** Filas con valor nulo excluidas de una suma (aggregate). */
  suppressedRows: number;
  /** Problemas que impiden usar la serie (duplicados, sin filas, valores inválidos). */
  issues: string[];
  /** Avisos no bloqueantes (signos desconocidos, etc.). */
  warnings: string[];
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** Elimina nulos al inicio y al final (la serie "empieza" en el primer valor publicado). */
export function trimNullEdges(obs: Observation[]): Observation[] {
  let a = 0, b = obs.length - 1;
  while (a <= b && obs[a]!.value === null) a++;
  while (b >= a && obs[b]!.value === null) b--;
  return obs.slice(a, b + 1);
}

/** Construye UNA serie API a partir de las filas (ya indexadas por período) de su dataset. */
export function buildApiSeries(def: SeriesDef, ds: DatasetConfig, rows: IndexedRow[]): SeriesBuild {
  const src = def.source as SourceSpec;
  const out: SeriesBuild = { id: def.id, observations: [], matchedRows: 0, suppressedRows: 0, issues: [], warnings: [] };
  if (src.kind !== 'api') {
    out.issues.push('no es una serie API');
    return out;
  }
  if (src.dataset !== ds.id) {
    out.issues.push(`dataset ${src.dataset} ≠ ${ds.id}`);
    return out;
  }
  if (ds.frequency !== def.frequency) out.issues.push(`frecuencia de la serie (${def.frequency}) ≠ frecuencia del dataset (${ds.frequency})`);
  const valueField = src.valueField ?? 'valor';
  const nullField = `${valueField}_null`;
  const scale = src.scaleFactor ?? 1;

  const byPeriod = new Map<Period, { values: (number | null)[]; flags: ObservationFlag[]; notes: string[] }>();
  const unknownSigns = new Set<string>();
  for (const { row, period } of rows) {
    if (!matchesSelector(row, src.selector)) continue;
    out.matchedRows++;
    if (!(valueField in row)) {
      out.issues.push(`la columna "${valueField}" no existe en las filas de ${ds.id}`);
      return out;
    }
    let value: number | null;
    try {
      value = parseValue(row[valueField], `${def.id} ${period}`);
    } catch (e) {
      out.issues.push((e as Error).message);
      continue;
    }
    const sign = flagsFromSign(row[nullField]);
    if (sign.unknown) unknownSigns.add(sign.unknown);
    const note = noteText(row.observaciones);
    let g = byPeriod.get(period);
    if (!g) byPeriod.set(period, (g = { values: [], flags: [], notes: [] }));
    g.values.push(value);
    g.flags.push(...sign.flags, ...flagsFromNote(note));
    if (note) g.notes.push(note);
  }
  if (unknownSigns.size) out.warnings.push(`signos no reconocidos en ${nullField}: ${[...unknownSigns].join(', ')}`);
  if (out.matchedRows === 0) {
    out.issues.push(`el selector ${JSON.stringify(src.selector)} no coincide con ninguna fila`);
    return out;
  }

  const dups: string[] = [];
  const obs: Observation[] = [];
  for (const [period, g] of byPeriod) {
    let value: number | null;
    if (src.aggregate === 'sum') {
      const nn = g.values.filter((v): v is number => v !== null);
      out.suppressedRows += g.values.length - nn.length;
      value = nn.length ? nn.reduce((a, b) => a + b, 0) * scale : null;
    } else {
      if (g.values.length > 1) {
        dups.push(`${period} (${g.values.length} filas)`);
        continue;
      }
      const v = g.values[0]!;
      value = v === null ? null : v * scale;
    }
    const o: Observation = { period, value };
    // En sumas, los signos de celdas individuales no califican al total salvo que TODO sea nulo.
    const flags = src.aggregate === 'sum' && value !== null ? uniq(g.flags.filter((f) => f === 'provisorio' || f === 'preliminar' || f === 'estimado')) : uniq(g.flags);
    if (flags.length) o.flags = flags;
    const notes = uniq(g.notes);
    if (notes.length) o.rawNote = notes.slice(0, 3).join(' | ');
    obs.push(o);
  }
  if (dups.length) {
    out.issues.push(`duplicados: el selector identifica más de una fila por período en ${dups.length} período(s), p.ej. ${dups.slice(0, 3).join(', ')}`);
    return out;
  }
  obs.sort((a, b) => comparePeriods(a.period, b.period));
  out.observations = trimNullEdges(obs);
  if (!out.observations.length) out.issues.push('la serie no tiene ningún valor publicado (todos nulos)');
  return out;
}

// ------------------------------------------------------------------ derivadas

/** Calcula una serie derivada con las funciones compartidas de src/core/transforms.ts. */
export function buildDerivedSeries(def: SeriesDef, getObs: (id: string) => Observation[] | null): SeriesBuild {
  const out: SeriesBuild = { id: def.id, observations: [], matchedRows: 0, suppressedRows: 0, issues: [], warnings: [] };
  const src = def.source as DerivedSpec;
  if (src.kind !== 'derived') {
    out.issues.push('no es una serie derivada');
    return out;
  }
  const need = (id: string): Observation[] | null => {
    const o = getObs(id);
    if (!o || !o.length) out.issues.push(`falta la serie de entrada ${id}`);
    return o;
  };
  const op = src.op;
  let obs: Observation[] = [];
  if (op.type === 'difference') {
    const a = need(op.minuend), b = need(op.subtrahend);
    if (a && b) obs = differenceSeries(a, b);
  } else if (op.type === 'real_index') {
    const n = need(op.nominal), d = need(op.deflator);
    if (n && d) {
      if (!toMap(n).has(op.basePeriod) || !toMap(d).has(op.basePeriod)) out.issues.push(`el período base ${op.basePeriod} falta en alguna de las series de entrada`);
      else obs = realIndex(n, d, op.basePeriod);
    }
  } else if (op.type === 'ipc_contribution') {
    const category = need(op.category), general = need(op.general);
    if (category && general) obs = ipcContribution(category, general, op.weight);
  } else if (op.type === 'sum') {
    const inputs = op.inputs.map(need);
    if (inputs.every((x) => x)) {
      const maps = inputs.map((x) => toMap(x!));
      obs = inputs[0]!
        .filter((o) => maps.every((m) => m.has(o.period)))
        .map((o) => {
          const vals = maps.map((m) => m.get(o.period) ?? null);
          return { period: o.period, value: vals.some((v) => v === null) ? null : (vals as number[]).reduce((a, b) => a + b, 0) };
        });
    }
  }
  if (out.issues.length) return out;
  out.observations = trimNullEdges(obs.map((o) => ({ period: o.period, value: o.value })));
  if (!out.observations.length) out.issues.push('la serie derivada quedó vacía');
  return out;
}

// ------------------------------------------------------------------ validación

/** Validación estructural antes de escribir: períodos válidos, orden estricto, valores finitos. */
export function validateObservations(def: Pick<SeriesDef, 'id' | 'frequency'>, obs: Observation[]): string[] {
  const errs: string[] = [];
  let prev: Period | null = null;
  let nonNull = 0;
  for (const o of obs) {
    if (!isValidPeriod(o.period, def.frequency)) {
      errs.push(`período inválido para frecuencia ${def.frequency}: "${o.period}"`);
      break;
    }
    if (prev !== null && comparePeriods(o.period, prev) <= 0) {
      errs.push(`períodos desordenados o duplicados: ${prev} → ${o.period}`);
      break;
    }
    if (o.value !== null && (typeof o.value !== 'number' || !Number.isFinite(o.value))) {
      errs.push(`valor inválido en ${o.period}`);
      break;
    }
    if (o.value !== null) nonNull++;
    prev = o.period;
  }
  if (!errs.length && nonNull === 0) errs.push('sin valores');
  return errs;
}
