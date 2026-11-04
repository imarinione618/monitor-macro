'use client';

import { useId, useMemo, useState } from 'react';
import { formatPeriodLong, periodStartDate } from '@/core/periods';
import type { Period, TransformId } from '@/core/types';
import { buildSnapshotModel, transformLabel } from '@/web/lib/chartModel';
import { buildSnapshotOption, exportSnapshotOption, type ChartTextMeta } from '@/web/lib/chartOptions';
import { CSV_BOM, csvNumber } from '@/web/lib/csv';
import { decimalsForUnit, formatNumber } from '@/web/lib/format';
import { buildSourceLine, collectNotes, seriesNotices, uniqueSources } from '@/web/lib/meta';
import type { ClientSeries } from '@/web/lib/types';
import { ChartToolbar, Notices, SourceFooter } from './ChartParts';
import { Segmented, Select } from './controls';
import { EChart, useChartTheme } from './EChart';

export interface SnapshotPanelProps {
  title: string;
  description?: string;
  series: ClientSeries[];
  /** Serie de referencia destacada (p.ej. nivel general). */
  referenceId?: string;
  transforms: TransformId[];
  defaultTransform: TransformId;
  extraNotes?: string[];
  synthetic?: boolean;
}

/** Barras horizontales con el corte de un período (por defecto, el último con datos). */
export function SnapshotPanel({ title, description, series, referenceId, transforms, defaultTransform, extraNotes = [], synthetic = false }: SnapshotPanelProps) {
  const uid = useId();
  const theme = useChartTheme();
  const [transform, setTransform] = useState<TransformId>(defaultTransform);
  const [period, setPeriod] = useState<Period | null>(null);
  const [showTable, setShowTable] = useState(false);

  const snap = useMemo(() => buildSnapshotModel(series, transform, period, referenceId), [series, transform, period, referenceId]);
  const freq = series[0]?.def.frequency ?? 'M';
  const subtitle = snap ? `${snap.transformLabel} · Unidad: ${snap.unit} · ${formatPeriodLong(snap.period)}` : '';
  const sourceLine = buildSourceLine(series, transform);
  const notes = collectNotes(series, extraNotes);
  const meta: ChartTextMeta = { title, subtitle, source: sourceLine, notes, synthetic };
  const option = useMemo(() => (snap ? buildSnapshotOption({ snap, theme, mode: 'screen' }) : null), [snap, theme]);
  const tableId = `${uid}-tabla`;
  const rows = snap?.rows.length ?? 0;

  return (
    <section className="panel" aria-labelledby={`${uid}-t`}>
      <header className="panel-head">
        <h2 id={`${uid}-t`}>{title}</h2>
        {description && <p className="panel-desc">{description}</p>}
      </header>
      <div className="controls">
        {transforms.length > 1 && (
          <Segmented label="Medida" value={transform} options={transforms.map((t) => ({ value: t, label: transformLabel(t, freq) }))} onChange={setTransform} />
        )}
        {snap && (
          <Select
            label="Período"
            value={snap.period}
            options={[...snap.periods].reverse().map((p) => ({ value: p, label: formatPeriodLong(p) }))}
            onChange={(p) => setPeriod(p)}
          />
        )}
      </div>
      {subtitle && <p className="chart-subtitle">{subtitle}</p>}
      <Notices notices={seriesNotices(series)} />
      <div className="chart-box" style={{ height: Math.max(260, rows * 26 + 40) }}>
        {snap ? (
          <EChart option={option} ariaLabel={`${title}. ${subtitle}. Los valores están disponibles en la tabla de datos.`} className="fill" />
        ) : (
          <div className="chart-empty" role="status">
            Sin datos en el store para este corte. Ejecutá `npm run data:refresh`.
          </div>
        )}
      </div>
      <ChartToolbar
        title={title}
        showTable={showTable}
        onToggleTable={() => setShowTable((v) => !v)}
        tableId={tableId}
        disabled={!snap}
        getCsv={() => {
          if (!snap) return '';
          const head = ['serie', 'id', 'fecha', 'periodo', `${snap.transformLabel} (${snap.unit})`].join(';');
          const lines = snap.rows.map((r) => [r.name.replace(/;/g, ','), r.id, periodStartDate(snap.period), snap.period, csvNumber(r.value)].join(';'));
          return CSV_BOM + [head, ...lines].join('\r\n') + '\r\n';
        }}
        getExportOption={() => (snap ? exportSnapshotOption({ snap, meta }) : null)}
      />
      <div id={tableId} hidden={!showTable}>
        {showTable && snap && (
          <div className="table-scroll" tabIndex={0} role="region" aria-label={`Tabla de datos: ${title}`}>
            <table className="data-table">
              <caption>
                {title}. {subtitle}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Serie</th>
                  <th scope="col">{snap.transformLabel}</th>
                </tr>
              </thead>
              <tbody>
                {snap.rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.name}</th>
                    <td>{formatNumber(r.value, decimalsForUnit(snap.unit))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <SourceFooter source={sourceLine} sources={uniqueSources(series)} notes={notes} />
    </section>
  );
}
