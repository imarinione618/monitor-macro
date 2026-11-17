'use client';

import { useId, useMemo, useState } from 'react';
import { formatPeriodLong } from '@/core/periods';
import type { Period } from '@/core/types';
import { formatNumber } from '@/web/lib/format';
import { buildWaterfallModel, buildWaterfallOption, exportWaterfallOption, waterfallCsv } from '@/web/lib/ipcWaterfall';
import { buildSourceLine, seriesNotices } from '@/web/lib/meta';
import type { ClientSeries } from '@/web/lib/types';
import { ChartToolbar, Notices, SourceFooter } from './ChartParts';
import { Select } from './controls';
import { EChart, useChartTheme } from './EChart';

interface Props { title: string; description?: string; series: ClientSeries[]; totalId: string; synthetic?: boolean }

/** Cascada: incidencias por división (de mayor a menor) que suman la inflación del mes. */
export function IpcWaterfallPanel({ title, description, series, totalId, synthetic = false }: Props) {
  const uid = useId();
  const theme = useChartTheme();
  const [period, setPeriod] = useState<Period | null>(null);
  const [showTable, setShowTable] = useState(false);
  const model = useMemo(() => buildWaterfallModel(series, totalId, period), [series, totalId, period]);
  const option = useMemo(() => (model ? buildWaterfallOption({ model, theme }) : null), [model, theme]);
  const source = buildSourceLine(series, 'level');
  const subtitle = model ? `Incidencia en p.p. · ${formatPeriodLong(model.period)} · inflación del mes: ${formatNumber(model.total, 1)} %` : '';
  const note = model?.residual != null ? `Estimación propia con ponderaciones nacionales de dic-2016; diferencia por redondeo entre la suma de divisiones y la inflación: ${formatNumber(model.residual, 2, { signed: true })} p.p.` : '';
  const steps = model?.steps.length ?? 0;

  return (
    <section className="panel" aria-labelledby={`${uid}-t`}>
      <header className="panel-head">
        <h2 id={`${uid}-t`}>{title}</h2>
        {description && <p className="panel-desc">{description}</p>}
      </header>
      <div className="controls">
        {model && <Select label="Período" value={model.period} options={[...model.periods].reverse().map((p) => ({ value: p, label: formatPeriodLong(p) }))} onChange={(p) => setPeriod(p)} />}
      </div>
      {subtitle && <p className="chart-subtitle">{subtitle}</p>}
      <Notices notices={seriesNotices(series)} />
      <div className="chart-box" style={{ height: Math.max(260, steps * 26 + 40) }}>
        {model ? <EChart option={option} ariaLabel={`${title}. ${subtitle}. Los valores están disponibles en la tabla de datos.`} className="fill" /> : <div className="chart-empty" role="status">Sin datos del IPC por división en el store.</div>}
      </div>
      <ChartToolbar
        title={title}
        showTable={showTable}
        onToggleTable={() => setShowTable((v) => !v)}
        tableId={`${uid}-tabla`}
        disabled={!model}
        getCsv={() => (model ? waterfallCsv(model) : '')}
        getExportOption={() => (model ? exportWaterfallOption({ model, exportMeta: { title, subtitle: `Incidencia en p.p. · ${formatPeriodLong(model.period)}`, note, source } }) : null)}
      />
      <div id={`${uid}-tabla`} hidden={!showTable}>
        {showTable && model && (
          <div className="table-scroll" tabIndex={0} role="region" aria-label={`Tabla de datos: ${title}`}>
            <table className="data-table">
              <caption>{title}. {subtitle}</caption>
              <thead>
                <tr>
                  <th scope="col">División</th>
                  <th scope="col">Incidencia (p.p.)</th>
                  <th scope="col">Acumulado (p.p.)</th>
                </tr>
              </thead>
              <tbody>
                {model.steps.map((s) => (
                  <tr key={s.id}>
                    <th scope="row" style={{ fontWeight: s.isTotal ? 700 : 400 }}>{s.name}{s.isTotal ? ' (var. %)' : ''}</th>
                    <td>{formatNumber(s.value, 2)}</td>
                    <td>{s.isTotal ? `suma: ${formatNumber(model.sum, 2)}` : formatNumber(s.value === null ? null : s.start + s.value, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {synthetic && <p className="callout">Datos sintéticos de prueba.</p>}
      <SourceFooter source={source} />
    </section>
  );
}
