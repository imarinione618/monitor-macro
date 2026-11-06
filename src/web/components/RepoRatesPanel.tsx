'use client';

import { useId, useMemo, useState } from 'react';
import type { MonetarySeries } from '@/monetary/types';
import { formatDateTimeAR, formatNumber } from '@/web/lib/format';
import { monetaryDate } from '@/web/lib/monetaryChartModel';
import { buildRepoRatesModel, buildRepoRatesOption, defaultRepoRatesFrom, repoRatesColors, repoRatesCsv, repoRatesRow, REPO_RATES_LABELS, REPO_RATES_UNITS } from '@/web/lib/repoRatesChart';
import { ChartToolbar, SourceFooter } from './ChartParts';
import { EChart, useChartTheme } from './EChart';

interface Props { title: string; description?: string; allSeries: MonetarySeries[]; asOf?: string }

/** Repo BCRA (área, eje izq.) con caución A3 y TAMAR (líneas, eje der.). */
export function RepoRatesPanel({ title, description, allSeries, asOf }: Props) {
  const uid = useId();
  const theme = useChartTheme();
  const [from, setFrom] = useState(() => defaultRepoRatesFrom(allSeries));
  const [to, setTo] = useState('');
  const [showTable, setShowTable] = useState(false);
  const model = useMemo(() => buildRepoRatesModel(allSeries, { from: from || undefined, to: to || undefined, asOf: asOf?.slice(0, 10) }), [allSeries, from, to, asOf]);
  const option = useMemo(() => buildRepoRatesOption({ model, title, theme }), [model, title, theme]);
  const hasValues = model.columns.some(c => c.points.some(p => p.value !== null));
  const missing = (['repo', 'caucion', 'tamar'] as const).filter(key => !model.columns.some(c => c.key === key));
  const colors = repoRatesColors(theme);

  return <section className="panel monetary-panel" aria-labelledby={`${uid}-title`}>
    <header className="panel-head"><h2 id={`${uid}-title`}>{title}</h2>{description && <p className="panel-desc">{description}</p>}</header>
    <div className="controls">
      <div className="ctl"><label className="ctl-label" htmlFor={`${uid}-from`}>Desde</label><input id={`${uid}-from`} type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
      <div className="ctl"><label className="ctl-label" htmlFor={`${uid}-to`}>Hasta</label><input id={`${uid}-to`} type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></div>
      <button className="btn monetary-all" type="button" onClick={() => { setFrom(''); setTo(''); }}>Toda la historia</button>
    </div>
    <div className="chart-meta"><p className="chart-subtitle">{model.subtitle}</p></div>
    {missing.length > 0 && <p className="monetary-status">Sin datos almacenados para: {missing.map(k => REPO_RATES_LABELS[k]).join(', ')}. El gráfico muestra las series disponibles.</p>}
    {model.columns.some(c => c.series.stale) && <p className="notice notice-stale">Se conserva el último conjunto válido de las series cuya actualización falló.</p>}
    <div className="chart-box">{hasValues ? <EChart option={option} ariaLabel={`${title}. ${model.subtitle}. Tabla de datos disponible.`} /> : <div className="chart-empty" role="status">No hay datos en el período elegido. Probá otro rango.</div>}</div>
    <div className="monetary-last-values">{model.columns.map(c => {
      const last = c.points.filter(p => p.value !== null).at(-1);
      return <div className="monetary-last" key={c.key}><strong style={{ borderLeft: `4px solid ${colors[c.key]}`, paddingLeft: 6 }}>{REPO_RATES_LABELS[c.key]}</strong><span>{formatNumber(last?.value, 2)} <small>{REPO_RATES_UNITS[c.key]}</small></span><small>{last ? monetaryDate(last.date) : 'Sin datos para el período'}</small></div>;
    })}</div>
    <ChartToolbar title={title} showTable={showTable} onToggleTable={() => setShowTable(v => !v)} tableId={`${uid}-table`} disabled={!hasValues} getCsv={() => repoRatesCsv(model)} getExportOption={() => hasValues ? buildRepoRatesOption({ model, title, theme, exportMode: true }) : null} />
    <div id={`${uid}-table`} hidden={!showTable}>{showTable && <div className="table-scroll" tabIndex={0} role="region" aria-label={`Tabla: ${title}`}><table className="data-table"><caption>{title}. {model.subtitle}</caption><thead><tr><th scope="col">Fecha</th>{model.columns.map(c => <th scope="col" key={c.key}>{REPO_RATES_LABELS[c.key]} ({REPO_RATES_UNITS[c.key]})</th>)}</tr></thead><tbody>{[...model.dates].reverse().map(date => {
      const row = repoRatesRow(model, date);
      return <tr key={date}><th scope="row">{monetaryDate(date)}</th>{model.columns.map(c => <td key={c.key}>{formatNumber(row[c.key], 2)}</td>)}</tr>;
    })}</tbody></table></div>}</div>
    <div className="monetary-definitions">{model.columns.map(c => <p key={c.key}><a href={c.series.def.sourceUrl} target="_blank" rel="noreferrer">{REPO_RATES_LABELS[c.key]}</a> · {c.series.def.convention} · {c.series.def.coverage}. {c.key === 'repo' && <span>Saldo en millones de ARS en la fuente; se muestra en billones (÷ 1.000.000). </span>}{c.key === 'caucion' && <span>{c.series.def.methodology} </span>}<span className="muted">Consulta: {formatDateTimeAR(c.series.retrievedAt)}.</span></p>)}</div>
    <SourceFooter source={model.source} />
  </section>;
}
