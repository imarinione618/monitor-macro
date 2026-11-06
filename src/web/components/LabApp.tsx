'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { EXPORT_SIZE, FONT_FAMILY, headerHeight } from '@/web/lib/chartOptions';
import { CSV_BOM, CSV_SEP, csvNumber } from '@/web/lib/csv';
import { formatNumber } from '@/web/lib/format';
import {
  AGGREGATION_LABELS, buildLabModel, canConvert, coarser, defaultAggregation, LAB_TRANSFORM_LABELS, labCsv, periodLabel, RATIO_LABELS, SCALES,
  type Aggregation, type Axis, type LabChartType, type LabItem, type LabModel, type LabTransform, type RatioOp,
} from '@/web/lib/lab';
import { LAB_FREQ_ORDER, LAB_FREQUENCY_LABELS, type LabFrequency, type LabSeriesData, type LabSeriesMeta } from '@/web/lib/labTypes';
import { sourceLineFor } from '@/web/lib/meta';
import { EXPORT_THEME, MAX_SERIES, type ChartTheme } from '@/web/lib/palette';
import { ChartToolbar, SourceFooter } from './ChartParts';
import { Segmented, Select } from './controls';
import { EChart, useChartTheme } from './EChart';

const DEFLATOR_ID = 'precios.ipc.ng.nacional';
const STORAGE_KEY = 'monitor-macro-laboratorio-v1';
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const toTime = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

interface State { items: LabItem[]; frequency: LabFrequency | null; from: string; to: string; logLeft: boolean; logRight: boolean }
const EMPTY: State = { items: [], frequency: null, from: '', to: '', logLeft: false, logRight: false };

export function buildLabOption({ model, title, subtitle, source, theme, exportMode = false, logLeft, logRight }: { model: LabModel; title: string; subtitle: string; source: string; theme: ChartTheme; exportMode?: boolean; logLeft: boolean; logRight: boolean }): EChartsCoreOption {
  const t = exportMode ? EXPORT_THEME : theme;
  const pad = exportMode ? 56 : 8;
  const fs = exportMode ? 17 : 12;
  const top = exportMode ? headerHeight({ title, subtitle, source }, EXPORT_SIZE.width, pad) : 8;
  const daily = model.frequency === 'D';
  const cols = model.columns.filter((c) => c.points.length);
  const hasRight = cols.some((c) => c.item.axis === 'right');
  const unitsOf = (axis: Axis) => [...new Set(cols.filter((c) => c.item.axis === axis).map((c) => c.unit))].join(' / ');
  const maps = new Map(cols.map((c) => [c.item.key, new Map(c.points)]));
  const yAxis = (axis: Axis, log: boolean) => ({
    type: log ? 'log' : 'value', scale: !log, position: axis, name: unitsOf(axis), nameTextStyle: { color: t.muted, fontSize: fs, align: axis === 'left' ? 'left' : 'right' },
    axisLabel: { color: t.muted, fontSize: fs, formatter: (v: number) => formatNumber(v, Math.abs(v) < 10 ? 1 : 0) }, splitLine: { show: axis === 'left', lineStyle: { color: t.grid } },
  });
  return {
    animation: !exportMode,
    useUTC: true,
    backgroundColor: exportMode ? '#ffffff' : 'transparent',
    textStyle: { fontFamily: FONT_FAMILY, color: t.text, fontSize: fs },
    grid: { left: pad, right: pad, top: top + 64, bottom: exportMode ? 100 : 12, containLabel: true },
    title: exportMode ? { text: title, subtext: subtitle, left: pad, top: 30, itemGap: 12, textStyle: { color: t.text, fontSize: 32, width: EXPORT_SIZE.width - pad * 2, overflow: 'break' }, subtextStyle: { color: t.textSecondary, fontSize: 19, width: EXPORT_SIZE.width - pad * 2, overflow: 'break' } } : undefined,
    legend: { show: true, type: exportMode ? 'plain' : 'scroll', top, left: pad, right: pad, selectedMode: false, textStyle: { color: t.text, fontSize: fs } },
    xAxis: daily
      ? { type: 'time', axisLine: { lineStyle: { color: t.axis } }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { color: t.muted, fontSize: fs, hideOverlap: true, formatter: (v: number) => { const d = new Date(v); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(2)}`; } } }
      : { type: 'category', data: model.periods.map(periodLabel), boundaryGap: cols.some((c) => c.item.type === 'bar'), axisLine: { lineStyle: { color: t.axis } }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: fs, hideOverlap: true } },
    yAxis: hasRight ? [yAxis('left', logLeft), yAxis('right', logRight)] : [yAxis('left', logLeft)],
    series: cols.map((c, i) => {
      const color = t.series[i % t.series.length]!;
      const m = maps.get(c.item.key)!;
      const data = daily ? c.points.map(([p, v]) => [toTime(p), v]) : model.periods.map((p) => m.get(p) ?? null);
      return {
        name: `${c.label}${hasRight ? (c.item.axis === 'left' ? ' (eje izq.)' : ' (eje der.)') : ''}`,
        type: c.item.type === 'bar' ? 'bar' : 'line', yAxisIndex: hasRight && c.item.axis === 'right' ? 1 : 0, data, connectNulls: false,
        showSymbol: !daily && model.periods.length <= 36, symbolSize: exportMode ? 7 : 4, barMaxWidth: exportMode ? 30 : 18,
        lineStyle: { width: c.item.type === 'area' ? 0 : exportMode ? 3.5 : 2, color }, itemStyle: { color },
        areaStyle: c.item.type === 'area' ? { color, opacity: 0.85 } : undefined, z: c.item.type === 'area' ? 1 : 3,
      };
    }),
    tooltip: exportMode ? undefined : {
      trigger: 'axis', confine: true, backgroundColor: t.surface, borderColor: t.axis, textStyle: { color: t.text },
      formatter: (raw: unknown) => {
        const rows = (Array.isArray(raw) ? raw : [raw]) as { seriesIndex: number; value: unknown; dataIndex: number; axisValue?: number }[];
        const first = rows[0];
        if (!first) return '';
        const period = daily ? new Date(Number((first.value as [number])[0])).toISOString().slice(0, 10) : model.periods[first.dataIndex]!;
        return `<b>${esc(periodLabel(period))}</b><br/>` + cols.map((c, i) => {
          const v = maps.get(c.item.key)!.get(period);
          return `<span style="color:${t.series[i % t.series.length]}">●</span> ${esc(c.label)}: <b>${v == null ? 'sin dato' : formatNumber(v, 2)}</b> <small>${esc(c.unit)}</small>`;
        }).join('<br/>');
      },
    },
    graphic: exportMode ? [{ type: 'text', left: pad, bottom: 30, style: { text: source, width: EXPORT_SIZE.width - pad * 2, overflow: 'break', fill: t.muted, font: `15px ${FONT_FAMILY}`, lineHeight: 21 } }] : [],
  };
}

/** Primera serie al eje izquierdo; una serie con otra unidad va al derecho. */
function axisFor(items: LabItem[], meta: LabSeriesMeta, byUnit?: (id: string) => string | undefined): Axis {
  const first = items.find((i) => i.kind === 'series') as { id: string } | undefined;
  if (!first || !byUnit) return 'left';
  return byUnit(first.id) === meta.unit ? 'left' : 'right';
}

export function LabApp({ catalog, basePath }: { catalog: LabSeriesMeta[]; basePath: string }) {
  const uid = useId();
  const theme = useChartTheme();
  const byId = useMemo(() => new Map(catalog.map((m) => [m.id, m])), [catalog]);
  const groups = useMemo(() => [...new Set(catalog.map((m) => m.group))], [catalog]);
  const [state, setState] = useState<State>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<Map<string, LabSeriesData>>(new Map());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [title, setTitle] = useState('Gráfico del laboratorio');
  const [showTable, setShowTable] = useState(false);
  const [ratio, setRatio] = useState<{ a: string; b: string; op: RatioOp; factor: number }>({ a: '', b: '', op: 'div', factor: 1 });

  // Estado local del visitante (preferencia, no dato compartido).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as State & { title?: string };
        setState({ ...EMPTY, ...s, items: (s.items ?? []).filter((i) => i.kind === 'ratio' || byId.has(i.id)) });
        if (s.title) setTitle(s.title);
      }
    } catch { /* sin almacenamiento disponible */ }
    setLoaded(true);
  }, [byId]);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, title })); } catch { /* ignorar */ }
  }, [state, title, loaded]);

  const seriesItems = state.items.filter((i): i is Extract<LabItem, { kind: 'series' }> => i.kind === 'series');
  const needed = useMemo(() => [...new Set([...seriesItems.map((i) => i.id), ...(state.items.some((i) => i.real) ? [DEFLATOR_ID] : [])])], [seriesItems, state.items]);
  useEffect(() => {
    for (const id of needed) {
      if (data.has(id) || errors[id]) continue;
      fetch(`${basePath}/lab-data/${encodeURIComponent(id)}.json`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d: LabSeriesData) => setData((m) => new Map(m).set(id, d)))
        .catch((e) => setErrors((x) => ({ ...x, [id]: (e as Error).message })));
    }
  }, [needed, data, errors, basePath]);

  const coarsest = seriesItems.reduce<LabFrequency>((f, i) => coarser(f, byId.get(i.id)?.frequency ?? 'D'), 'D');
  const frequency: LabFrequency = state.frequency && seriesItems.every((i) => canConvert(byId.get(i.id)!.frequency, state.frequency!)) ? state.frequency : coarsest;
  const model = useMemo(() => buildLabModel({ items: state.items, catalog: byId, data, frequency, deflatorId: DEFLATOR_ID, from: state.from || undefined, to: state.to || undefined }), [state.items, byId, data, frequency, state.from, state.to]);
  const source = sourceLineFor(model.orgs);
  const has = model.columns.some((c) => c.points.some(([, v]) => v !== null));
  const colMaps = useMemo(() => new Map(model.columns.map((c) => [c.item.key, new Map(c.points)])), [model]);
  const span = model.periods.length ? `${periodLabel(model.periods[0]!)}–${periodLabel(model.periods.at(-1)!)}` : '';
  const subtitle = [LAB_FREQUENCY_LABELS[frequency], ...model.columns.map((c) => `${c.label}: ${c.unit}${c.item.transform !== 'level' ? `, ${LAB_TRANSFORM_LABELS[c.item.transform].toLowerCase()}` : ''}`), span].filter(Boolean).join(' · ');
  const option = useMemo(() => buildLabOption({ model, title, subtitle, source, theme, logLeft: state.logLeft, logRight: state.logRight }), [model, title, subtitle, source, theme, state.logLeft, state.logRight]);

  const update = (key: string, patch: Partial<LabItem>) => setState((s) => ({ ...s, items: s.items.map((i) => (i.key === key ? ({ ...i, ...patch } as LabItem) : i)) }));
  const remove = (key: string) => setState((s) => ({ ...s, items: s.items.filter((i) => i.key !== key && !(i.kind === 'ratio' && (i.a === key || i.b === key))) }));
  const add = (meta: LabSeriesMeta) => setState((s) => s.items.length >= MAX_SERIES ? s : ({
    ...s, items: [...s.items, { kind: 'series', id: meta.id, key: `${meta.id}#${Date.now()}`, label: meta.shortName, axis: axisFor(s.items, meta, (id) => byId.get(id)?.unit), type: 'line', transform: 'level', scale: 1, real: false, aggregation: defaultAggregation(meta) }],
  }));
  const addRatio = () => {
    if (!ratio.a || !ratio.b || ratio.a === ratio.b) return;
    const la = state.items.find((i) => i.key === ratio.a)?.label ?? 'A', lb = state.items.find((i) => i.key === ratio.b)?.label ?? 'B';
    const sym = { div: '/', mul: '×', sub: '−', add: '+' }[ratio.op];
    setState((s) => s.items.length >= MAX_SERIES ? s : ({ ...s, items: [...s.items, { kind: 'ratio', key: `ratio#${Date.now()}`, a: ratio.a, b: ratio.b, op: ratio.op, label: `${la} ${sym} ${lb}`, axis: 'left', type: 'line', transform: 'level', scale: ratio.factor, real: false, aggregation: 'mean' }] }));
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return catalog.filter((m) => (!group || m.group === group) && (!q || `${m.name} ${m.shortName} ${m.id} ${m.group}`.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(q))).slice(0, 60);
  }, [catalog, query, group]);

  return (
    <div className="lab">
      <section className="panel lab-picker" aria-labelledby={`${uid}-cat`}>
        <header className="panel-head"><h2 id={`${uid}-cat`}>Variables disponibles ({catalog.length})</h2><p className="panel-desc">Buscá por nombre y agregá hasta {MAX_SERIES} series o cálculos. Cada serie conserva su fuente, unidad y frecuencia original.</p></header>
        <div className="controls">
          <div className="ctl"><label className="ctl-label" htmlFor={`${uid}-q`}>Buscar</label><input id={`${uid}-q`} type="search" value={query} placeholder="p. ej. PIB, M2, IVA, caución, nafta" onChange={(e) => setQuery(e.target.value)} /></div>
          <Select label="Sección" value={group} options={[{ value: '', label: 'Todas' }, ...groups.map((g) => ({ value: g, label: g }))]} onChange={setGroup} />
        </div>
        <ul className="lab-results">
          {results.map((m) => (
            <li key={m.id}>
              <button type="button" className="btn" disabled={state.items.length >= MAX_SERIES} onClick={() => add(m)} aria-label={`Agregar ${m.name}`}>+</button>
              <span><strong>{m.name}</strong><small>{m.group} · {LAB_FREQUENCY_LABELS[m.frequency]} · {m.unit} · {m.start ? periodLabel(m.start) : '—'}–{m.end ? periodLabel(m.end) : '—'}{m.note ? ` · ${m.note}` : ''}</small></span>
            </li>
          ))}
          {!results.length && <li className="muted">Sin resultados.</li>}
        </ul>
      </section>

      <section className="panel" aria-labelledby={`${uid}-chart`}>
        <header className="panel-head">
          <h2 id={`${uid}-chart`}><input className="lab-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Título del gráfico" /></h2>
        </header>
        {state.items.length === 0 && <p className="callout">Agregá variables desde la lista para armar un gráfico. Podés convertir frecuencias, deflactar por IPC, cambiar escalas, usar dos ejes y crear ratios entre series.</p>}

        {state.items.length > 0 && (
          <>
            <div className="controls">
              <Segmented label="Frecuencia" value={frequency} options={LAB_FREQ_ORDER.map((f) => ({ value: f, label: LAB_FREQUENCY_LABELS[f], disabled: !seriesItems.every((i) => canConvert(byId.get(i.id)!.frequency, f)), title: 'Solo frecuencias iguales o más bajas que la de cada serie' }))} onChange={(f) => setState((s) => ({ ...s, frequency: f }))} />
              <div className="ctl"><label className="ctl-label" htmlFor={`${uid}-from`}>Desde</label><input id={`${uid}-from`} type="date" value={state.from} onChange={(e) => setState((s) => ({ ...s, from: e.target.value }))} /></div>
              <div className="ctl"><label className="ctl-label" htmlFor={`${uid}-to`}>Hasta</label><input id={`${uid}-to`} type="date" value={state.to} min={state.from || undefined} onChange={(e) => setState((s) => ({ ...s, to: e.target.value }))} /></div>
              <label className="lab-check"><input type="checkbox" checked={state.logLeft} onChange={(e) => setState((s) => ({ ...s, logLeft: e.target.checked }))} /> Escala logarítmica (eje izq.)</label>
              <label className="lab-check"><input type="checkbox" checked={state.logRight} onChange={(e) => setState((s) => ({ ...s, logRight: e.target.checked }))} /> Escala logarítmica (eje der.)</label>
              <button type="button" className="btn" onClick={() => setState(EMPTY)}>Vaciar</button>
            </div>

            <div className="table-scroll"><table className="data-table lab-items">
              <thead><tr><th scope="col">Serie</th><th scope="col">Agregación</th><th scope="col">Precios</th><th scope="col">Transformación</th><th scope="col">Escala</th><th scope="col">Eje</th><th scope="col">Tipo</th><th scope="col"><span className="visually-hidden">Quitar</span></th></tr></thead>
              <tbody>
                {state.items.map((it) => {
                  const meta = it.kind === 'series' ? byId.get(it.id) : null;
                  const col = model.columns.find((c) => c.item.key === it.key);
                  const needsAgg = meta ? meta.frequency !== frequency : false;
                  return (
                    <tr key={it.key}>
                      <th scope="row">
                        <input className="lab-label" value={it.label} onChange={(e) => update(it.key, { label: e.target.value })} aria-label="Nombre en el gráfico" />
                        <small className="muted">{meta ? `${meta.name} · ${meta.unit} · ${LAB_FREQUENCY_LABELS[meta.frequency]}` : it.kind === 'ratio' ? `${RATIO_LABELS[it.op]}${it.scale !== 1 ? ` × ${formatNumber(it.scale, 0)}` : ''}` : ''}</small>
                        {meta && errors[meta.id] && <small className="hint-warn">No se pudieron cargar los datos ({errors[meta.id]}).</small>}
                        {col?.problem && <small className="hint-warn">{col.problem}</small>}
                      </th>
                      <td>{needsAgg ? <select value={it.aggregation} onChange={(e) => update(it.key, { aggregation: e.target.value as Aggregation })} aria-label="Agregación">{(['mean', 'last', 'sum'] as Aggregation[]).map((a) => <option key={a} value={a}>{AGGREGATION_LABELS[a]}</option>)}</select> : <span className="muted">—</span>}</td>
                      <td>{it.kind === 'series' ? <label className="lab-check"><input type="checkbox" checked={it.real} onChange={(e) => update(it.key, { real: e.target.checked })} /> Reales (IPC)</label> : <span className="muted">según A y B</span>}</td>
                      <td><select value={it.transform} onChange={(e) => update(it.key, { transform: e.target.value as LabTransform })} aria-label="Transformación">{(Object.keys(LAB_TRANSFORM_LABELS) as LabTransform[]).map((t) => <option key={t} value={t}>{LAB_TRANSFORM_LABELS[t]}</option>)}</select></td>
                      <td><select value={it.scale} onChange={(e) => update(it.key, { scale: Number(e.target.value) })} aria-label="Escala">{[...SCALES, ...(SCALES.some((s) => s.value === it.scale) ? [] : [{ value: it.scale, label: `× ${it.scale}` }])].map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></td>
                      <td><select value={it.axis} onChange={(e) => update(it.key, { axis: e.target.value as Axis })} aria-label="Eje"><option value="left">Izquierdo</option><option value="right">Derecho</option></select></td>
                      <td><select value={it.type} onChange={(e) => update(it.key, { type: e.target.value as LabChartType })} aria-label="Tipo"><option value="line">Línea</option><option value="bar">Barras</option><option value="area">Área</option></select></td>
                      <td><button type="button" className="btn" onClick={() => remove(it.key)} aria-label={`Quitar ${it.label}`}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>

            {seriesItems.length >= 2 && (
              <fieldset className="ctl lab-ratio"><legend>Crear ratio o cálculo entre series</legend>
                <div className="controls">
                  <Select label="A" value={ratio.a} options={[{ value: '', label: 'Elegir…' }, ...seriesItems.map((i) => ({ value: i.key, label: i.label }))]} onChange={(a) => setRatio((r) => ({ ...r, a }))} />
                  <Select label="Operación" value={ratio.op} options={(Object.keys(RATIO_LABELS) as RatioOp[]).map((o) => ({ value: o, label: RATIO_LABELS[o] }))} onChange={(op) => setRatio((r) => ({ ...r, op }))} />
                  <Select label="B" value={ratio.b} options={[{ value: '', label: 'Elegir…' }, ...seriesItems.map((i) => ({ value: i.key, label: i.label }))]} onChange={(b) => setRatio((r) => ({ ...r, b }))} />
                  <Select label="Multiplicar por" value={String(ratio.factor)} options={[{ value: '1', label: '1' }, { value: '100', label: '100 (en %)' }]} onChange={(f) => setRatio((r) => ({ ...r, factor: Number(f) }))} />
                  <button type="button" className="btn" disabled={!ratio.a || !ratio.b || ratio.a === ratio.b || state.items.length >= MAX_SERIES} onClick={addRatio}>Agregar cálculo</button>
                </div>
                <p className="muted">Se calcula sobre períodos comunes, después de convertir la frecuencia y deflactar cada serie (si corresponde) y antes de la transformación elegida para el cálculo. Un faltante en A o B deja el período vacío.</p>
              </fieldset>
            )}

            <div className="chart-meta"><p className="chart-subtitle">{subtitle}</p></div>
            {model.columns.some((c) => c.partial.size > 0) && frequency !== 'D' && <p className="monetary-status">El último período de las series diarias convertidas puede estar incompleto (promedio, último o suma de los días publicados hasta la fecha).</p>}
            <div className="chart-box">{has ? <EChart option={option} ariaLabel={`${title}. ${subtitle}. Tabla de datos disponible.`} /> : <div className="chart-empty" role="status">Cargando datos o sin observaciones para la selección.</div>}</div>
            <ChartToolbar title={title} showTable={showTable} onToggleTable={() => setShowTable((v) => !v)} tableId={`${uid}-table`} disabled={!has} getCsv={() => labCsv(model, CSV_BOM, CSV_SEP, csvNumber)} getExportOption={() => (has ? buildLabOption({ model, title, subtitle, source, theme, exportMode: true, logLeft: state.logLeft, logRight: state.logRight }) : null)} />
            <div id={`${uid}-table`} hidden={!showTable}>{showTable && (
              <div className="table-scroll" tabIndex={0} role="region" aria-label={`Tabla: ${title}`}><table className="data-table"><caption>{title}. {subtitle}</caption>
                <thead><tr><th scope="col">Período</th>{model.columns.map((c) => <th scope="col" key={c.item.key}>{c.label} ({c.unit})</th>)}</tr></thead>
                <tbody>{[...model.periods].reverse().slice(0, 1500).map((p) => <tr key={p}><th scope="row">{periodLabel(p)}</th>{model.columns.map((c) => <td key={c.item.key}>{formatNumber(colMaps.get(c.item.key)?.get(p), 2)}</td>)}</tr>)}</tbody>
              </table></div>
            )}</div>
            <SourceFooter source={source} />
          </>
        )}
      </section>
    </div>
  );
}
