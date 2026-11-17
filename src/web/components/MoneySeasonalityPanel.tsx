'use client';

import { useId, useMemo, useState } from 'react';
import type { IpcPoint } from '@/monetary/analytics';
import type { MonetarySeries } from '@/monetary/types';
import { formatNumber } from '@/web/lib/format';
import {
  buildSeasonality,
  buildSeasonalityOption,
  exportSeasonalityOption,
  M2_PRIVADO_ID,
  realMonthlyChanges,
  seasonalityCsv,
  windowLabel,
  type SeasonalityWindow,
} from '@/web/lib/moneySeasonality';
import { ChartToolbar, SourceFooter } from './ChartParts';
import { Segmented, Select } from './controls';
import { EChart, useChartTheme } from './EChart';

interface Props { title: string; description?: string; allSeries: MonetarySeries[]; ipc: IpcPoint[]; asOf?: string }

type Preset = '3' | '5' | '10' | 'all' | 'custom';
const SOURCE = 'Fuente: one618 en base a BCRA e INDEC.';

/** Estacionalidad de la demanda de dinero: var. % mensual real promedio del M2 privado por mes calendario. */
export function MoneySeasonalityPanel({ title, description, allSeries, ipc, asOf }: Props) {
  const uid = useId();
  const theme = useChartTheme();
  const [mode, setMode] = useState<'mean' | 'close'>('mean');
  const [preset, setPreset] = useState<Preset>('10');
  const [range, setRange] = useState<{ from: number | null; to: number | null }>({ from: null, to: null });
  const [compare, setCompare] = useState<string>('auto');
  const [showTable, setShowTable] = useState(false);

  const m2 = allSeries.find((s) => s.def.id === M2_PRIVADO_ID);
  const changes = useMemo(() => realMonthlyChanges(m2, ipc, mode, asOf?.slice(0, 10)), [m2, ipc, mode, asOf]);
  const years = useMemo(() => [...new Set(changes.map((c) => c.year))].sort((a, b) => a - b), [changes]);
  const first = years[0] ?? 0, last = years.at(-1) ?? 0;
  const from = Math.min(Math.max(range.from ?? first, first), last), to = Math.max(Math.min(range.to ?? last, last), from);
  const win: SeasonalityWindow =
    preset === 'custom' ? { kind: 'range', from, to } : preset === 'all' ? { kind: 'range', from: first, to: last } : { kind: 'last', years: Number(preset) };
  const compareYear = compare === 'none' ? null : compare === 'auto' ? (years.length ? last : null) : Number(compare);
  const winKey = JSON.stringify(win);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const model = useMemo(() => buildSeasonality(changes, win, compareYear), [changes, winKey, compareYear]);
  const avgLabel = win.kind === 'last' ? `Promedio últimos ${win.years} años` : `Promedio ${model.usedFrom ?? ''}–${model.usedTo ?? ''}`;
  const option = useMemo(() => buildSeasonalityOption({ model, theme, avgLabel }), [model, theme, avgLabel]);
  const hasValues = model.rows.some((r) => r.mean !== null);
  const modeLabel = mode === 'mean' ? 'saldo promedio mensual' : 'saldo de fin de mes';
  const subtitle = `Var. % mensual real · ${windowLabel(model, win)} · ${modeLabel}, deflactado por IPC nacional`;
  const note = `${windowLabel(model, win)}. M2 privado (${modeLabel}) a precios constantes con el IPC nacional del INDEC`;

  return (
    <section className="panel monetary-panel" aria-labelledby={`${uid}-title`}>
      <header className="panel-head">
        <h2 id={`${uid}-title`}>{title}</h2>
        {description && <p className="panel-desc">{description}</p>}
      </header>
      <div className="controls">
        <Segmented
          label="Años"
          value={preset}
          options={[
            ...(['3', '5', '10'] as const).map((n) => ({ value: n, label: `Últimos ${n}`, disabled: years.length < Number(n), title: years.length < Number(n) ? `Hay ${years.length} años con datos` : undefined })),
            { value: 'all' as const, label: 'Todos' },
            { value: 'custom' as const, label: 'Personalizado' },
          ]}
          onChange={(p) => {
            if (p === 'custom') setRange({ from: model.usedFrom ?? first, to: model.usedTo ?? last });
            setPreset(p);
          }}
        />
        {years.length > 0 && (
          <div className="ctl-pair">
            <Select label="Desde (año)" value={String(preset === 'custom' ? from : (model.usedFrom ?? first))} options={years.map((y) => ({ value: String(y), label: String(y), disabled: y > to }))} onChange={(v) => { setRange({ from: Number(v), to }); setPreset('custom'); }} />
            <Select label="Hasta (año)" value={String(preset === 'custom' ? to : (model.usedTo ?? last))} options={years.map((y) => ({ value: String(y), label: String(y), disabled: y < from }))} onChange={(v) => { setRange({ from, to: Number(v) }); setPreset('custom'); }} />
          </div>
        )}
        <Segmented label="Saldo mensual" value={mode} options={[{ value: 'mean', label: 'Promedio' }, { value: 'close', label: 'Fin de mes' }]} onChange={setMode} />
        <Select
          label="Comparar con"
          value={compare === 'auto' ? String(compareYear ?? 'none') : compare}
          options={[{ value: 'none', label: 'Sin comparación' }, ...[...years].reverse().map((y) => ({ value: String(y), label: String(y) }))]}
          onChange={setCompare}
        />
      </div>
      <div className="chart-meta"><p className="chart-subtitle">{subtitle}</p></div>
      {m2?.stale && <p className="notice notice-stale">Se conserva el último conjunto válido del M2 privado: la última actualización falló.</p>}
      <div className="chart-box">
        {hasValues ? <EChart option={option} ariaLabel={`${title}. ${subtitle}. Tabla de datos disponible.`} /> : <div className="chart-empty" role="status">Sin datos del M2 privado o del IPC para calcular la estacionalidad.</div>}
      </div>
      <ChartToolbar
        title={title}
        showTable={showTable}
        onToggleTable={() => setShowTable((v) => !v)}
        tableId={`${uid}-table`}
        disabled={!hasValues}
        getCsv={() => seasonalityCsv(model, avgLabel)}
        getExportOption={() => (hasValues ? exportSeasonalityOption({ model, avgLabel, exportMeta: { title, subtitle: 'Var. % mensual real del M2 privado', note, source: SOURCE } }) : null)}
      />
      <div id={`${uid}-table`} hidden={!showTable}>
        {showTable && (
          <div className="table-scroll" tabIndex={0} role="region" aria-label={`Tabla: ${title}`}>
            <table className="data-table">
              <caption>{title}. {subtitle}</caption>
              <thead>
                <tr>
                  <th scope="col">Mes</th>
                  <th scope="col">{avgLabel} (%)</th>
                  <th scope="col">Años promediados</th>
                  {model.compareYear !== null && <th scope="col">{model.compareYear} (%)</th>}
                </tr>
              </thead>
              <tbody>
                {model.rows.map((r) => (
                  <tr key={r.month}>
                    <th scope="row">{r.label}</th>
                    <td>{formatNumber(r.mean, 2)}</td>
                    <td>{r.count ? `${r.count} (${r.years[0]}–${r.years.at(-1)})` : '—'}</td>
                    {model.compareYear !== null && <td>{formatNumber(r.compare, 2)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="muted small">
        Demanda de dinero: M2 privado (circulante + cheques cancelatorios + cuentas corrientes y cajas de ahorro en pesos del sector privado; cálculo propio con
        series de la API BCRA) a precios constantes. Para cada mes calendario se promedia su variación mensual real en los años elegidos; «Últimos N años» toma los
        N valores más recientes de cada mes. Solo meses completos con IPC publicado; el IPC nacional base dic-2016 limita la historia a 2017 en adelante.
      </p>
      <SourceFooter source={SOURCE} />
    </section>
  );
}
