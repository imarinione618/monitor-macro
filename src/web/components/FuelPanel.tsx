'use client';

import { useId, useMemo, useState } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import type { FuelProduct, FuelScope, FuelSeries } from '@/combustibles/types';
import { EXPORT_SIZE, FONT_FAMILY, headerHeight } from '@/web/lib/chartOptions';
import { CSV_BOM, CSV_SEP, csvNumber } from '@/web/lib/csv';
import { formatNumber } from '@/web/lib/format';
import { periodLabel, transform, type Point } from '@/web/lib/lab';
import { EXPORT_THEME, type ChartTheme } from '@/web/lib/palette';
import { ChartToolbar, SourceFooter } from './ChartParts';
import { Segmented } from './controls';
import { EChart, useChartTheme } from './EChart';

const PRODUCTS: { value: FuelProduct; label: string }[] = [
  { value: 'super', label: 'Nafta súper' }, { value: 'premium', label: 'Nafta premium' }, { value: 'gasoil_g2', label: 'Gasoil grado 2' }, { value: 'gasoil_g3', label: 'Gasoil grado 3' },
];
type Kind = 'surtidor' | 'eess';
type Measure = 'level' | 'pct_yoy';
type Range = '1y' | '3y' | 'all';
const SOURCE = 'Fuente: one618 en base a Secretaría de Energía.';
const toTime = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.length > 7 ? d.slice(8, 10) : 1));

interface Col { product: FuelProduct; label: string; series: FuelSeries; points: Point[]; n: Map<string, number | undefined> }

function buildOption({ cols, title, subtitle, unit, daily, breakDate, theme, exportMode = false }: { cols: Col[]; title: string; subtitle: string; unit: string; daily: boolean; breakDate: string | null; theme: ChartTheme; exportMode?: boolean }): EChartsCoreOption {
  const t = exportMode ? EXPORT_THEME : theme;
  const pad = exportMode ? 56 : 8;
  const fs = exportMode ? 17 : 12;
  const top = exportMode ? headerHeight({ title, subtitle, source: SOURCE }, EXPORT_SIZE.width, pad) : 8;
  const colors: Record<FuelProduct, string> = { super: t.series[0]!, premium: t.series[3]!, gasoil_g2: t.series[1]!, gasoil_g3: t.series[2]! };
  return {
    animation: !exportMode, useUTC: true, backgroundColor: exportMode ? '#ffffff' : 'transparent',
    textStyle: { fontFamily: FONT_FAMILY, color: t.text, fontSize: fs },
    grid: { left: pad, right: pad, top: top + 48, bottom: exportMode ? 100 : 12, containLabel: true },
    title: exportMode ? { text: title, subtext: subtitle, left: pad, top: 30, itemGap: 12, textStyle: { color: t.text, fontSize: 32, width: EXPORT_SIZE.width - pad * 2, overflow: 'break' }, subtextStyle: { color: t.textSecondary, fontSize: 19, width: EXPORT_SIZE.width - pad * 2, overflow: 'break' } } : undefined,
    legend: { show: true, top, left: pad, right: pad, selectedMode: false, textStyle: { color: t.text, fontSize: fs } },
    xAxis: { type: 'time', axisLine: { lineStyle: { color: t.axis } }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { color: t.muted, fontSize: fs, hideOverlap: true, formatter: (v: number) => { const d = new Date(v); return daily ? `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(2)}` : `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; } } },
    yAxis: { type: 'value', scale: true, name: unit, nameTextStyle: { color: t.muted, fontSize: fs, align: 'left' }, axisLabel: { color: t.muted, fontSize: fs, formatter: (v: number) => formatNumber(v, 0) }, splitLine: { lineStyle: { color: t.grid } } },
    series: cols.map((c, i) => ({
      name: c.label, type: 'line', showSymbol: !daily && c.points.length <= 36, symbolSize: 4, connectNulls: false, data: c.points.map(([p, v]) => [toTime(p), v]),
      lineStyle: { width: exportMode ? 3.5 : 2, color: colors[c.product] }, itemStyle: { color: colors[c.product] },
      markLine: i === 0 && breakDate ? { symbol: 'none', silent: true, lineStyle: { color: t.muted, type: 'dashed' }, label: { formatter: 'Quiebre: YPF deja de informar', color: t.muted, fontSize: exportMode ? 15 : 11, position: 'insideEndTop' }, data: [{ xAxis: toTime(breakDate) }] } : undefined,
    })),
    tooltip: exportMode ? undefined : {
      trigger: 'axis', confine: true, backgroundColor: t.surface, borderColor: t.axis, textStyle: { color: t.text },
      formatter: (raw: unknown) => {
        const first = (Array.isArray(raw) ? raw : [raw])[0] as { value: [number, number | null] } | undefined;
        if (!first) return '';
        const iso = new Date(first.value[0]).toISOString().slice(0, daily ? 10 : 7);
        return `<b>${periodLabel(iso)}</b><br/>` + cols.map((c) => {
          const v = c.points.find(([p]) => p === iso)?.[1];
          const n = c.n.get(iso);
          return `<span style="color:${colors[c.product]}">●</span> ${c.label}: <b>${v == null ? 'sin dato' : formatNumber(v, unit === '%' ? 1 : 0)}</b> ${unit}${n ? ` <small>(${n} ${daily ? 'estaciones' : 'registros'})</small>` : ''}`;
        }).join('<br/>');
      },
    },
    graphic: exportMode ? [{ type: 'text', left: pad, bottom: 30, style: { text: SOURCE, width: EXPORT_SIZE.width - pad * 2, overflow: 'break', fill: t.muted, font: `15px ${FONT_FAMILY}`, lineHeight: 21 } }] : [],
  };
}

export function FuelPanel({ series }: { series: FuelSeries[] }) {
  const uid = useId();
  const theme = useChartTheme();
  const [kind, setKind] = useState<Kind>('surtidor');
  const [scope, setScope] = useState<FuelScope>('nacional');
  const [products, setProducts] = useState<FuelProduct[]>(['super', 'gasoil_g2']);
  const [measure, setMeasure] = useState<Measure>('level');
  const [range, setRange] = useState<Range>('3y');
  const [showTable, setShowTable] = useState(false);
  const daily = kind === 'surtidor';

  const cols: Col[] = useMemo(() => products.flatMap((product) => {
    const s = series.find((x) => x.def.id === `combustibles.${kind}.${product}.${scope}`);
    if (!s) return [];
    const raw: Point[] = s.observations.map((o) => [o.date, o.value]);
    const tr = measure === 'level' ? raw : transform(raw, daily ? 'D' : 'M', 'pct_yoy');
    const last = s.observations.at(-1)?.date ?? '';
    const from = range === 'all' || !last ? '' : `${Number(last.slice(0, 4)) - (range === '1y' ? 1 : 3)}${last.slice(4)}`;
    return [{ product, label: PRODUCTS.find((p) => p.value === product)!.label, series: s, points: tr.filter(([p]) => !from || p > from), n: new Map(s.observations.map((o) => [o.date, o.n])) }];
  }), [series, products, kind, scope, measure, range, daily]);

  const unit = measure === 'level' ? '$ por litro' : '%';
  const all = cols.flatMap((c) => c.points.map(([p]) => p)).sort();
  const span = all.length ? `${periodLabel(all[0]!)}–${periodLabel(all.at(-1)!)}` : '';
  const breakDate = daily ? cols[0]?.series.def.breaks?.[0]?.date ?? null : null;
  const visibleBreak = breakDate && all.length && breakDate >= all[0]! ? breakDate : null;
  const title = daily ? 'Combustibles: precio diario en surtidor' : 'Combustibles: precio mensual ponderado por volumen';
  const subtitle = [daily ? 'Mediana diaria entre estaciones (Res. 314/2016)' : 'Promedio mensual ponderado por volumen, canal al público (Res. 1104/04)', scope === 'caba' ? 'Ciudad de Buenos Aires' : 'Total país', measure === 'level' ? '$ por litro, precio final' : 'Var. % interanual', span].filter(Boolean).join(' · ');
  const option = useMemo(() => buildOption({ cols, title, subtitle, unit, daily, breakDate: visibleBreak, theme }), [cols, title, subtitle, unit, daily, visibleBreak, theme]);
  const has = cols.some((c) => c.points.some(([, v]) => v !== null));
  const periods = [...new Set(all)].reverse();
  const maps = cols.map((c) => new Map(c.points));
  const csv = () => CSV_BOM + [['fecha', ...cols.flatMap((c) => [`${c.series.def.name} [${unit}]`, `${c.label}: n`])].join(CSV_SEP), ...[...periods].reverse().map((p) => [p, ...cols.flatMap((c, i) => [csvNumber(maps[i]!.get(p)), String(c.n.get(p) ?? '')])].join(CSV_SEP))].join('\r\n') + '\r\n';

  return (
    <section className="panel monetary-panel" aria-labelledby={`${uid}-t`}>
      <header className="panel-head">
        <h2 id={`${uid}-t`}>Combustibles: precios en surtidor</h2>
        <p className="panel-desc">Secretaría de Energía. Diaria: mediana de los precios vigentes declarados por las estaciones (Res. 314/2016). Mensual: promedio ponderado por volumen vendido, incluye YPF (Res. 1104/04, ≈1 mes de rezago).</p>
      </header>
      <div className="controls">
        <Segmented label="Serie" value={kind} options={[{ value: 'surtidor', label: 'Diaria' }, { value: 'eess', label: 'Mensual ponderada' }]} onChange={setKind} />
        <Segmented label="Ámbito" value={scope} options={[{ value: 'nacional', label: 'Total país' }, { value: 'caba', label: 'CABA' }]} onChange={setScope} />
        <Segmented label="Medida" value={measure} options={[{ value: 'level', label: '$ por litro' }, { value: 'pct_yoy', label: 'Var. % i.a.' }]} onChange={setMeasure} />
        <Segmented label="Rango" value={range} options={[{ value: '1y', label: '1 año' }, { value: '3y', label: '3 años' }, { value: 'all', label: 'Toda la historia' }]} onChange={setRange} />
      </div>
      <fieldset className="ctl picker"><legend>Productos</legend><div className="picker-row">{PRODUCTS.map((p) => {
        const on = products.includes(p.value);
        return <label key={p.value} className={`chip${on ? ' is-on' : ''}`}><input type="checkbox" checked={on} onChange={() => setProducts((cur) => (on ? (cur.length > 1 ? cur.filter((x) => x !== p.value) : cur) : [...cur, p.value]))} /><span>{p.label}</span></label>;
      })}</div></fieldset>
      <div className="chart-meta"><p className="chart-subtitle">{subtitle}</p></div>
      {daily && <p className="monetary-status"><strong>Quiebre de cobertura desde julio de 2025:</strong> YPF casi no informa precios en la Res. 314; la muestra pierde ~1.500 estaciones y el nivel diario queda por encima del mensual ponderado por composición. Para niveles comparables en el tiempo usá la serie mensual ponderada.</p>}
      <div className="chart-box">{has ? <EChart option={option} ariaLabel={`${title}. ${subtitle}. Tabla de datos disponible.`} /> : <div className="chart-empty" role="status">Sin datos de combustibles en el store.</div>}</div>
      <div className="monetary-last-values">{cols.map((c) => {
        const last = c.series.observations.filter((o) => o.value !== null).at(-1);
        return <div className="monetary-last" key={c.product}><strong>{c.label}</strong><span>{formatNumber(last?.value, 0)} <small>$ por litro</small></span><small>{last ? `${periodLabel(last.date)}${last.n ? ` · ${last.n} ${daily ? 'estaciones' : 'registros'}` : ''}` : 'Sin datos'}</small></div>;
      })}</div>
      <ChartToolbar title={title} showTable={showTable} onToggleTable={() => setShowTable((v) => !v)} tableId={`${uid}-table`} disabled={!has} getCsv={csv} getExportOption={() => (has ? buildOption({ cols, title, subtitle, unit, daily, breakDate: visibleBreak, theme, exportMode: true }) : null)} />
      <div id={`${uid}-table`} hidden={!showTable}>{showTable && (
        <div className="table-scroll" tabIndex={0} role="region" aria-label={`Tabla: ${title}`}><table className="data-table"><caption>{title}. {subtitle}</caption>
          <thead><tr><th scope="col">Fecha</th>{cols.map((c) => <th scope="col" key={c.product}>{c.label} ({unit})</th>)}</tr></thead>
          <tbody>{periods.slice(0, 1200).map((p) => <tr key={p}><th scope="row">{periodLabel(p)}</th>{cols.map((c, i) => <td key={c.product}>{formatNumber(maps[i]!.get(p), measure === 'level' ? 0 : 1)}{c.n.get(p) ? <small className="monetary-cell-meta">n = {c.n.get(p)}</small> : null}</td>)}</tr>)}</tbody>
        </table></div>
      )}</div>
      <div className="monetary-definitions">{cols.slice(0, 1).map((c) => <p key={c.product}>{c.series.def.method}</p>)}</div>
      <SourceFooter source={SOURCE} />
    </section>
  );
}
