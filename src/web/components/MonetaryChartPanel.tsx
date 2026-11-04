'use client';

import { useId, useMemo, useState } from 'react';
import type { MonetarySeries } from '@/monetary/types';
import { buildMonetaryChartModel, monetaryChartCsv, monetaryDate, SECTOR_LABELS, TRANSFORM_LABELS, type IpcPoint, type MonetaryOptions } from '@/web/lib/monetaryChartModel';
import { buildMonetaryChartOption } from '@/web/lib/monetaryChartOptions';
import { formatDateTimeAR, formatNumber } from '@/web/lib/format';
import { MAX_SERIES } from '@/web/lib/palette';
import { ChartToolbar, SourceFooter } from './ChartParts';
import { Segmented, Select } from './controls';
import { EChart, useChartTheme } from './EChart';

interface Props {
  title: string;
  description?: string;
  series: MonetarySeries[];
  allSeries: MonetarySeries[];
  ipc: IpcPoint[];
  defaultIds?: string[];
  mode?: 'rate' | 'stock' | 'ratio' | 'composition';
  defaultTransform?: MonetaryOptions['transform'];
  asOf?: string;
}

export function MonetaryChartPanel({ title, description, series, allSeries, ipc, defaultIds, mode = 'stock', defaultTransform = 'level', asOf }: Props) {
  const uid = useId();
  const theme = useChartTheme();
  const initial = defaultIds?.filter(id => series.some(s => s.def.id === id)) ?? [];
  const [selected, setSelected] = useState(initial.length ? initial : series.slice(0, mode === 'composition' ? 8 : 2).map(s => s.def.id));
  const [frequency, setFrequency] = useState<'D' | 'M'>(mode === 'rate' ? 'D' : 'M');
  const [monthlyMode, setMonthlyMode] = useState<'mean' | 'close'>('mean');
  const [valueMode, setValueMode] = useState<'nominal' | 'real'>('nominal');
  const [transform, setTransform] = useState<MonetaryOptions['transform']>(defaultTransform);
  const [basePeriod, setBasePeriod] = useState('');
  const [from, setFrom] = useState('2018-01-01');
  const [to, setTo] = useState('');
  const [showTable, setShowTable] = useState(false);
  const picked = useMemo(() => series.filter(s => selected.includes(s.def.id)), [series, selected]);
  const realAvailable = mode === 'stock' && frequency === 'M' && picked.every(s => s.def.currency === 'ARS');
  const effectiveValueMode = realAvailable ? valueMode : 'nominal';
  const choices: MonetaryOptions['transform'][] = mode === 'rate' ? ['level', 'change_pp', 'change_bp'] : mode === 'ratio' || mode === 'composition' ? ['level'] : frequency === 'M' ? ['level', 'pct_mom', 'pct_yoy', 'absolute_mom', 'base100'] : ['level', 'base100'];
  const effectiveTransform = choices.includes(transform) ? transform : 'level';
  const options: MonetaryOptions = { frequency, monthlyMode, valueMode: effectiveValueMode, transform: effectiveTransform, basePeriod: basePeriod || undefined, asOf: asOf?.slice(0, 10), from: (frequency === 'M' ? from.slice(0, 7) : from) || undefined, to: (frequency === 'M' ? to.slice(0, 7) : to) || undefined };
  const model = useMemo(() => buildMonetaryChartModel(picked, options, ipc, allSeries, mode === 'composition'), [picked, frequency, monthlyMode, effectiveValueMode, effectiveTransform, basePeriod, asOf, from, to, ipc, allSeries, mode]);
  const hasValues = model.columns.some(c => c.values.some(v => v !== null));
  const stacked = mode === 'composition' && model.columns.every(c => c.values.every(v => v === null || v >= 0));
  const option = useMemo(() => buildMonetaryChartOption({ model, title, theme, kind: stacked ? 'stacked' : 'line' }), [model, title, theme, stacked]);
  const baseCandidates = effectiveValueMode === 'real' ? ipc.filter(p => p.value !== null).map(p => p.period) : [...new Set(picked.flatMap(s => s.observations.filter(o => o.value !== null).map(o => frequency === 'M' ? o.date.slice(0, 7) : o.date)))].sort();
  const hasPartial = model.columns.some(c => c.points.some(p => p.partial));
  const toggle = (id: string) => {
    if (!selected.includes(id) && series.find(s => s.def.id === id)?.def.frequency === 'M') setFrequency('M');
    setSelected(current => current.includes(id) ? current.length > 1 ? current.filter(v => v !== id) : current : [...current, id]);
  };

  return <section className="panel monetary-panel" aria-labelledby={`${uid}-title`}>
    <header className="panel-head"><h2 id={`${uid}-title`}>{title}</h2>{description && <p className="panel-desc">{description}</p>}</header>
    <div className="controls">
      <Segmented label="Frecuencia" value={frequency} options={[{ value: 'D', label: 'Diaria', disabled: !series.some(s => s.def.frequency === 'D') }, { value: 'M', label: 'Mensual' }]} onChange={setFrequency} />
      {frequency === 'M' && <Segmented label="Observación mensual" value={monthlyMode} options={[{ value: 'mean', label: 'Promedio' }, { value: 'close', label: 'Cierre' }]} onChange={setMonthlyMode} />}
      {mode === 'stock' && <Segmented label="Precios" value={effectiveValueMode} options={[{ value: 'nominal', label: 'Nominal' }, { value: 'real', label: 'Real (IPC)', disabled: !realAvailable, title: 'Solo saldos mensuales en ARS' }]} onChange={setValueMode} />}
      {choices.length > 1 && <Select label="Medida" value={effectiveTransform} options={choices.map(value => ({ value, label: TRANSFORM_LABELS[value] }))} onChange={setTransform} />}
      {(effectiveValueMode === 'real' || effectiveTransform === 'base100') && <Select label={effectiveValueMode === 'real' ? 'Mes base del IPC' : 'Período base (=100)'} value={basePeriod} options={[{ value: '', label: effectiveValueMode === 'real' ? 'Último IPC disponible' : 'Primer período de la selección' }, ...[...baseCandidates].reverse().map(value => ({ value, label: monetaryDate(value) }))]} onChange={setBasePeriod} />}
      <div className="ctl"><label className="ctl-label" htmlFor={`${uid}-from`}>Desde</label><input id={`${uid}-from`} type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
      <div className="ctl"><label className="ctl-label" htmlFor={`${uid}-to`}>Hasta</label><input id={`${uid}-to`} type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></div>
      <button className="btn monetary-all" type="button" onClick={() => { setFrom(''); setTo(''); }}>Toda la historia</button>
    </div>
    {series.length > 1 && <fieldset className="ctl picker"><legend>Series <span className="muted">(hasta {MAX_SERIES})</span></legend><div className="picker-row">{series.map(s => {
      const on = selected.includes(s.def.id);
      const disabled = !on && (selected.length >= MAX_SERIES || picked.some(p => p.def.unit !== s.def.unit));
      const index = picked.findIndex(p => p.def.id === s.def.id);
      return <label className={`chip${on ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`} key={s.def.id} title={s.def.name}><input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(s.def.id)} /><span className="chip-swatch" aria-hidden="true" style={on ? { background: theme.series[index % theme.series.length] } : undefined} /><span>{s.def.shortName}</span></label>;
    })}</div></fieldset>}
    <div className="chart-meta"><p className="chart-subtitle">{model.subtitle}</p></div>
    {hasPartial && <p className="monetary-status">Mes parcial: el corte efectivo se informa por serie en la tabla y en el gráfico. Las variaciones mensuales excluyen meses incompletos.</p>}
    {effectiveValueMode === 'real' && <p className="monetary-status">Sin IPC publicado para un mes, el valor real queda sin dato.</p>}
    {mode === 'composition' && <p className="monetary-status">Composición de las series seleccionadas sobre fechas comunes. Un dato faltante deja incompleta esa fecha; no se reemplaza por cero.</p>}
    {picked.some(s => s.stale) && <p className="notice notice-stale">Se conserva el último conjunto válido de las series cuya actualización falló.</p>}
    {picked.flatMap(s => (s.def.regimeNotes ?? []).map((note, i) => <p className="monetary-status" key={`${s.def.id}-${i}`}><strong>{s.def.shortName}:</strong> {note}</p>))}
    <div className="chart-box">{hasValues ? <EChart option={option} ariaLabel={`${title}. ${model.subtitle}. Tabla de datos disponible.`} /> : <div className="chart-empty" role="status">No hay datos compatibles con esta frecuencia, convención y período. Probá otra selección.</div>}</div>
    <div className="monetary-last-values">{model.columns.map(c => {
      const last = c.points.filter(p => p.value !== null).at(-1);
      return <div className="monetary-last" key={c.series.def.id}><strong>{c.series.def.shortName}</strong><span>{formatNumber(last?.value, 2)} <small>{model.unit}</small></span><small>{last ? `${monetaryDate(last.period)}${last.partial ? ' · parcial' : ''} · corte ${monetaryDate(last.effectiveDate)}` : 'Sin datos para la selección'}</small><small>{c.series.def.currency ?? ''} · {SECTOR_LABELS[c.series.def.sector]}</small></div>;
    })}</div>
    <ChartToolbar title={title} showTable={showTable} onToggleTable={() => setShowTable(v => !v)} tableId={`${uid}-table`} disabled={!hasValues} getCsv={() => monetaryChartCsv(model)} getExportOption={() => hasValues ? buildMonetaryChartOption({ model, title, theme, exportMode: true, kind: stacked ? 'stacked' : 'line' }) : null} />
    <div id={`${uid}-table`} hidden={!showTable}>{showTable && <div className="table-scroll" tabIndex={0} role="region" aria-label={`Tabla: ${title}`}><table className="data-table"><caption>{title}. {model.subtitle}</caption><thead><tr><th scope="col">Período</th>{model.columns.map(c => <th scope="col" key={c.series.def.id}>{c.series.def.shortName}</th>)}</tr></thead><tbody>{model.periods.map((period, i) => ({ period, i })).reverse().map(({ period, i }) => <tr key={period}><th scope="row">{monetaryDate(period)}</th>{model.columns.map(c => {
      const point = c.points.find(p => p.period === period);
      const value = c.values[i];
      const color = effectiveTransform === 'pct_yoy' || effectiveTransform === 'pct_mom' ? c.series.def.category === 'total' || value == null || value === 0 ? theme.reference : value > 0 ? theme.series[1] : theme.series[0] : undefined;
      return <td key={c.series.def.id} style={{ color }}><span>{formatNumber(value, 2)}</span>{point && <small className="monetary-cell-meta">{point.partial ? 'Parcial · ' : ''}{monetaryDate(point.effectiveDate)} · {point.coverageCount} obs.</small>}</td>;
    })}</tr>)}</tbody></table></div>}</div>
    <div className="monetary-definitions">{picked.map(s => {
      const published = s.observations.filter(o => o.value !== null).at(-1);
      return <p key={s.def.id}><a href={s.def.sourceUrl} target="_blank" rel="noreferrer">{s.def.shortName}</a> · {s.def.convention} · {s.def.coverage}. {s.def.bcraId === 0 && <span>{s.def.methodology} </span>}{published && <span>Último dato publicado: {formatNumber(published.value, 2)} {s.def.unit} ({monetaryDate(published.date)}). </span>}<span className="muted">Consulta: {formatDateTimeAR(s.retrievedAt)}.</span></p>;
    })}</div>
    <SourceFooter source={model.source} />
  </section>;
}
