/**
 * Verificación del registro contra la API: cada serie API debe identificar exactamente
 * una fila por período (o ≥ 1 fila si es agregada), tener valores y una frecuencia coherente.
 */
import { DATASETS } from '../core/datasets';
import { SERIES } from '../core/registry';
import { currentMonthBA, periodRange, shiftPeriod } from '../core/periods';
import type { DatasetConfig, DatasetId, Period, SeriesDef, SourceSpec } from '../core/types';
import type { IndecClient } from './client';
import { toIngestError } from './errors';
import { fetchDatasetRows } from './fetch-dataset';
import { buildApiSeries, indexRows, matchesSelector } from './normalize';

export interface SeriesCheck {
  id: string;
  dataset: DatasetId;
  ok: boolean;
  /** Ventana consultada (datasets por ventana) o null si se consultó la historia completa. */
  windowFrom: Period | null;
  matchedRows: number;
  firstPeriod: Period | null;
  lastPeriod: Period | null;
  count: number;
  nulls: number;
  /** Períodos faltantes entre el primero y el último. */
  gaps: number;
  /** Filas por período (min–max) — debe ser 1–1 en series no agregadas. */
  rowsPerPeriod: [number, number];
  flagged: number;
  problems: string[];
  warnings: string[];
}

export interface CheckReport {
  checkedAt: string;
  ok: boolean;
  series: SeriesCheck[];
  datasetErrors: { dataset: DatasetId; message: string }[];
}

export async function checkRegistry(opts: {
  client: IndecClient;
  datasets?: DatasetId[];
  full?: boolean;
  series?: SeriesDef[];
  datasetConfigs?: Record<DatasetId, DatasetConfig>;
  now?: Date;
  log?: (m: string) => void;
}): Promise<CheckReport> {
  const log = opts.log ?? (() => {});
  const all = (opts.series ?? SERIES).filter((s) => s.source.kind === 'api');
  const cfgs = opts.datasetConfigs ?? DATASETS;
  const now = opts.now ?? new Date();
  const dsIds = [...new Set(all.map((s) => (s.source as SourceSpec).dataset))].filter((d) => !opts.datasets?.length || opts.datasets.includes(d));
  const report: CheckReport = { checkedAt: now.toISOString(), ok: true, series: [], datasetErrors: [] };

  for (const dsId of dsIds) {
    const ds = cfgs[dsId];
    const windowFrom = ds.refreshMode === 'windowed' && !opts.full ? shiftPeriod(currentMonthBA(now), -ds.revisionWindowMonths) : null;
    log(`Consultando ${dsId}${windowFrom ? ` (desde ${windowFrom})` : ''}…`);
    let indexed;
    try {
      const res = await fetchDatasetRows(opts.client, ds, { fromPeriod: windowFrom ?? undefined });
      indexed = indexRows(ds, res.rows);
    } catch (e) {
      const err = toIngestError(e);
      report.ok = false;
      report.datasetErrors.push({ dataset: dsId, message: `${err.kind}: ${err.message}` });
      for (const def of all.filter((s) => (s.source as SourceSpec).dataset === dsId)) {
        report.series.push({ id: def.id, dataset: dsId, ok: false, windowFrom, matchedRows: 0, firstPeriod: null, lastPeriod: null, count: 0, nulls: 0, gaps: 0, rowsPerPeriod: [0, 0], flagged: 0, problems: [`dataset no disponible: ${err.message}`], warnings: [] });
      }
      continue;
    }
    for (const def of all.filter((s) => (s.source as SourceSpec).dataset === dsId)) {
      const src = def.source as SourceSpec;
      const built = buildApiSeries(def, ds, indexed);
      const perPeriod = new Map<Period, number>();
      for (const r of indexed) if (matchesSelector(r.row, src.selector)) perPeriod.set(r.period, (perPeriod.get(r.period) ?? 0) + 1);
      const counts = [...perPeriod.values()];
      const obs = built.observations;
      const first = obs[0]?.period ?? null, last = obs[obs.length - 1]?.period ?? null;
      const expected = first && last ? periodRange(first, last).length : 0;
      const problems = [...built.issues];
      const c: SeriesCheck = {
        id: def.id,
        dataset: dsId,
        ok: problems.length === 0,
        windowFrom,
        matchedRows: built.matchedRows,
        firstPeriod: first,
        lastPeriod: last,
        count: obs.length,
        nulls: obs.filter((o) => o.value === null).length,
        gaps: expected - obs.length,
        rowsPerPeriod: counts.length ? [Math.min(...counts), Math.max(...counts)] : [0, 0],
        flagged: obs.filter((o) => o.flags?.length).length,
        problems,
        warnings: built.warnings,
      };
      if (!c.ok) report.ok = false;
      report.series.push(c);
    }
  }
  return report;
}

/** Tabla de texto para la consola. */
export function formatCheckTable(r: CheckReport): string {
  const head = ['Serie', 'Estado', 'Inicio', 'Fin', 'Obs.', 'Nulos', 'Huecos', 'Filas/per.', 'Detalle'];
  const rows = r.series.map((s) => [
    s.id,
    s.ok ? 'OK' : 'PROBLEMA',
    s.firstPeriod ?? '—',
    s.lastPeriod ?? '—',
    String(s.count),
    String(s.nulls),
    String(s.gaps),
    s.rowsPerPeriod[0] === s.rowsPerPeriod[1] ? String(s.rowsPerPeriod[0]) : `${s.rowsPerPeriod[0]}–${s.rowsPerPeriod[1]}`,
    [...s.problems, ...s.warnings.map((w) => `aviso: ${w}`), s.windowFrom ? `ventana desde ${s.windowFrom}` : ''].filter(Boolean).join('; '),
  ]);
  const widths = head.map((h, i) => Math.min(i === 8 ? 200 : 60, Math.max(h.length, ...rows.map((x) => x[i]!.length))));
  const line = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i]!)).join(' | ').trimEnd();
  return [line(head), widths.map((w) => '-'.repeat(w)).join('-|-'), ...rows.map(line)].join('\n');
}
