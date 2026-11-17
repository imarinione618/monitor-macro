'use client';

import { useId, useMemo, useState } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { FONT_FAMILY, noteLine } from '@/web/lib/chartOptions';
import {
  EXPORT_FONT, EXPORT_FONT_FAMILY, EXPORT_LEGEND_H, EXPORT_LEGEND_OVERRIDES, EXPORT_MARKS, EXPORT_PAD,
  exportFooter, exportGrid, exportHeaderHeight, exportTitle, NO_SPLIT_LINE,
} from '@/web/lib/exportStyle';
import { CSV_BOM, CSV_SEP, csvNumber } from '@/web/lib/csv';
import { formatNumber } from '@/web/lib/format';
import type { AggregateGdpModel } from '@/web/lib/aggregatesGdp';
import { EXPORT_THEME, type ChartTheme } from '@/web/lib/palette';
import { ChartToolbar, SourceFooter } from './ChartParts';
import { PeriodRange, Segmented } from './controls';
import { EChart, useChartTheme } from './EChart';

const qLabel = (p: string) => `T${p.slice(6)} ${p.slice(0, 4)}`;
type Range = '5y' | '10y' | 'all' | 'custom';

/** 'custom': trimestres entre `custom.from` y `custom.to` inclusive. */
export function filterRange(model: AggregateGdpModel, range: Range, custom: { from?: string; to?: string } = {}): AggregateGdpModel {
  if (range === 'all' || !model.periods.length) return model;
  let keep: (p: string) => boolean;
  if (range === 'custom') keep = (p) => (!custom.from || p >= custom.from) && (!custom.to || p <= custom.to);
  else {
    const last = model.periods.at(-1)!;
    const from = `${Number(last.slice(0, 4)) - (range === '5y' ? 5 : 10)}-${last.slice(5)}`;
    keep = (p) => p > from;
  }
  return { ...model, periods: model.periods.filter(keep), columns: model.columns.map((c) => ({ ...c, points: c.points.filter((p) => keep(p.period)) })) };
}

export function aggregatesGdpCsv(model: AggregateGdpModel): string {
  const maps = model.columns.map((c) => new Map(c.points.map((p) => [p.period, p])));
  const head = ['trimestre', ...model.columns.flatMap((c) => [`${c.label} (% del PIB)`, `${c.label}: estimado`, `${c.label}: días con dato`])];
  const lines = model.periods.map((p) => [p, ...maps.flatMap((m) => {
    const x = m.get(p);
    return [csvNumber(x?.value), x ? (x.estimated ? (x.partial ? 'sí (trimestre en curso)' : 'sí') : 'no') : '', x ? String(x.days) : ''];
  })].join(CSV_SEP));
  return CSV_BOM + [head.join(CSV_SEP), ...lines].join('\r\n') + '\r\n';
}

export function buildAggregatesGdpOption({ model, title, subtitle, note = '', source, theme, exportMode = false }: { model: AggregateGdpModel; title: string; subtitle: string; note?: string; source: string; theme: ChartTheme; exportMode?: boolean }): EChartsCoreOption {
  const t = exportMode ? EXPORT_THEME : theme;
  const pad = exportMode ? EXPORT_PAD : 8;
  const fs = exportMode ? EXPORT_FONT.text : 12;
  const top = exportMode ? exportHeaderHeight(title, subtitle) : 8;
  const foot = exportMode ? exportFooter([noteLine(note), source], t) : null;
  const lw = exportMode ? EXPORT_MARKS.line : 2;
  const idx = new Map(model.periods.map((p, i) => [p, i]));
  const series = model.columns.flatMap((c, i) => {
    const color = t.series[i % t.series.length]!;
    const official = model.periods.map(() => null as number | null);
    const estimated = model.periods.map(() => null as number | null);
    const lastOfficial = c.points.filter((p) => !p.estimated).at(-1);
    for (const p of c.points) (p.estimated ? estimated : official)[idx.get(p.period)!] = p.value;
    if (lastOfficial && c.points.some((p) => p.estimated)) estimated[idx.get(lastOfficial.period)!] = lastOfficial.value; // une la punteada con el último oficial
    return [
      { name: c.label, type: 'line', data: official, showSymbol: false, connectNulls: false, lineStyle: { width: lw, color }, itemStyle: { color } },
      { name: `${c.label} (estimado)`, type: 'line', data: estimated, showSymbol: true, symbolSize: exportMode ? EXPORT_MARKS.symbol : 5, connectNulls: false, lineStyle: { width: lw, color, type: 'dashed' }, itemStyle: { color } },
    ];
  });
  return {
    animation: !exportMode,
    backgroundColor: exportMode ? '#ffffff' : 'transparent',
    textStyle: { fontFamily: exportMode ? EXPORT_FONT_FAMILY : FONT_FAMILY, color: t.text, fontSize: fs },
    grid: foot ? exportGrid(top + EXPORT_LEGEND_H + 4, foot.height) : { left: pad, right: pad, top: top + 48, bottom: 12, containLabel: true },
    title: exportMode ? exportTitle(title, subtitle, t) : undefined,
    legend: { show: true, top, left: pad, right: pad, selectedMode: false, textStyle: { color: t.text, fontSize: fs }, data: model.columns.map((c) => c.label), ...(exportMode ? EXPORT_LEGEND_OVERRIDES : {}) },
    xAxis: { type: 'category', data: model.periods.map(qLabel), boundaryGap: false, axisLine: { lineStyle: { color: t.axis } }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: fs, hideOverlap: true } },
    yAxis: { type: 'value', scale: true, axisLabel: { color: t.muted, fontSize: fs, formatter: (v: number) => `${formatNumber(v, 0)} %` }, splitLine: exportMode ? NO_SPLIT_LINE : { lineStyle: { color: t.grid } } },
    series,
    tooltip: exportMode ? undefined : {
      trigger: 'axis', confine: true, backgroundColor: t.surface, borderColor: t.axis, textStyle: { color: t.text },
      formatter: (raw: unknown) => {
        const first = (Array.isArray(raw) ? raw : [raw])[0] as { dataIndex: number } | undefined;
        const period = model.periods[first?.dataIndex ?? 0];
        if (!period) return '';
        return `<b>${qLabel(period)}</b><br/>` + model.columns.map((c, i) => {
          const p = c.points.find((x) => x.period === period);
          return `<span style="color:${t.series[i % t.series.length]}">●</span> ${c.label}: <b>${p?.value == null ? 'sin dato' : `${formatNumber(p.value, 1)} %`}</b>${p?.estimated ? ` · estimado${p.partial ? ' (trimestre en curso)' : ''}` : ''}`;
        }).join('<br/>');
      },
    },
    graphic: foot?.graphic ?? [],
  };
}

export function AggregatesGdpPanel({ title, description, model, source }: { title: string; description?: string; model: AggregateGdpModel; source: string }) {
  const uid = useId();
  const theme = useChartTheme();
  const [range, setRange] = useState<Range>('10y');
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const [showTable, setShowTable] = useState(false);
  const visible = useMemo(() => filterRange(model, range, custom), [model, range, custom]);
  const shownFrom = visible.periods[0] ?? model.periods[0] ?? '';
  const shownTo = visible.periods.at(-1) ?? model.periods.at(-1) ?? '';
  const chooseRange = (r: Range) => {
    if (r === 'custom') setCustom({ from: shownFrom, to: shownTo });
    setRange(r);
  };
  const span = visible.periods.length ? `${qLabel(visible.periods[0]!)}–${qLabel(visible.periods.at(-1)!)}` : 'Sin datos';
  const subtitle = `Promedio trimestral de saldos ÷ PIB corriente anual móvil · % · Línea punteada: estimación con el último PIB disponible · ${span}`;
  const exportNote = `Promedio trimestral de saldos ÷ PIB corriente anual móvil · Línea punteada: estimación con el último PIB disponible · ${span}`;
  const option = useMemo(() => buildAggregatesGdpOption({ model: visible, title, subtitle, source, theme }), [visible, title, subtitle, source, theme]);
  const has = visible.columns.some((c) => c.points.length);

  return <section className="panel monetary-panel" aria-labelledby={`${uid}-t`}>
    <header className="panel-head"><h2 id={`${uid}-t`}>{title}</h2>{description && <p className="panel-desc">{description}</p>}</header>
    <div className="controls">
      <Segmented label="Rango" value={range} options={[{ value: '5y', label: '5 años' }, { value: '10y', label: '10 años' }, { value: 'all', label: 'Toda la historia' }, { value: 'custom', label: 'Personalizado' }]} onChange={chooseRange} />
      <PeriodRange periods={model.periods} from={shownFrom} to={shownTo} format={qLabel} onChange={(from, to) => { setCustom({ from, to }); setRange('custom'); }} />
    </div>
    <div className="chart-meta"><p className="chart-subtitle">{subtitle}</p></div>
    <div className="chart-box">{has ? <EChart option={option} ariaLabel={`${title}. ${subtitle}. Tabla de datos disponible.`} /> : <div className="chart-empty" role="status">Faltan datos de PIB o de agregados.</div>}</div>
    <div className="monetary-last-values">{visible.columns.map((c) => {
      const off = c.points.filter((p) => !p.estimated).at(-1);
      const est = c.points.filter((p) => p.estimated).at(-1);
      return <div className="monetary-last" key={c.id}><strong>{c.label}</strong><span>{formatNumber(off?.value, 1)} <small>% PIB · {off ? qLabel(off.period) : '—'}</small></span>{est && <small>Estimado {qLabel(est.period)}{est.partial ? ' (en curso)' : ''}: {formatNumber(est.value, 1)} %</small>}</div>;
    })}</div>
    <ChartToolbar title={title} showTable={showTable} onToggleTable={() => setShowTable((v) => !v)} tableId={`${uid}-table`} disabled={!has} getCsv={() => aggregatesGdpCsv(visible)} getExportOption={() => has ? buildAggregatesGdpOption({ model: visible, title, subtitle: '% del PIB', note: exportNote, source, theme, exportMode: true }) : null} />
    <div id={`${uid}-table`} hidden={!showTable}>{showTable && <div className="table-scroll" tabIndex={0} role="region" aria-label={`Tabla: ${title}`}><table className="data-table"><caption>{title}. {subtitle}</caption><thead><tr><th scope="col">Trimestre</th>{visible.columns.map((c) => <th scope="col" key={c.id}>{c.label} (% PIB)</th>)}</tr></thead><tbody>{[...visible.periods].reverse().map((p) => <tr key={p}><th scope="row">{qLabel(p)}</th>{visible.columns.map((c) => {
      const x = c.points.find((y) => y.period === p);
      return <td key={c.id}>{formatNumber(x?.value, 2)}{x?.estimated && <small className="monetary-cell-meta">estimado{x.partial ? ' · en curso' : ''} · {x.days} días</small>}</td>;
    })}</tr>)}</tbody></table></div>}</div>
    <p className="monetary-status">{model.methodology}</p>
    <SourceFooter source={source} />
  </section>;
}
