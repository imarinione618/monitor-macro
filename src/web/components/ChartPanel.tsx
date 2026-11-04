'use client';

import { useId, useMemo, useState } from 'react';
import { formatPeriodLong, formatPeriodShort } from '@/core/periods';
import { TRANSFORMS } from '@/core/transforms';
import type { Period, SeasonalAdjustment, TransformId } from '@/core/types';
import {
  adjustmentLabel,
  availableAdjustments,
  buildChartModel,
  compatibility,
  pickTransform,
  resolveVariant,
  transformChoices,
} from '@/web/lib/chartModel';
import { buildSubtitle, buildTimeSeriesOption, effectiveKind, exportTimeSeriesOption, type ChartTextMeta } from '@/web/lib/chartOptions';
import { toCsv } from '@/web/lib/csv';
import { decimalsForUnit, formatNumber } from '@/web/lib/format';
import { buildSourceLine, collectNotes, lastPeriodsLine, seriesNotices, uniqueSources } from '@/web/lib/meta';
import { assignColorSlots, MAX_SERIES } from '@/web/lib/palette';
import { RANGE_LABELS, type ChartKind, type ClientSeries, type RangeId } from '@/web/lib/types';
import { ChartToolbar, Notices, SourceFooter } from './ChartParts';
import { Segmented, Select } from './controls';
import { EChart, useChartTheme, useElementWidth } from './EChart';

export interface ChartPanelProps {
  title: string;
  description?: string;
  /** Todas las series disponibles (incluye variantes de ajuste estacional). */
  pool: ClientSeries[];
  /** IDs seleccionables en el selector de series (sin las variantes). */
  options: string[];
  defaultSelected: string[];
  defaultTransform: TransformId;
  /** Transformaciones a probar si la elegida deja de ser válida (p.ej. al cambiar el ajuste). */
  fallbackTransforms?: TransformId[];
  defaultAdjustment?: SeasonalAdjustment;
  defaultRange?: RangeId;
  kind?: ChartKind;
  /** Rótulo del selector de series ("Series", "Región"...). */
  pickerLabel?: string;
  /** Aviso destacado (p.ej. cobertura EPH). */
  callout?: string;
  extraNotes?: string[];
  synthetic?: boolean;
}

const RANGE_IDS: RangeId[] = ['12m', '24m', '5y', 'all'];

export function ChartPanel(props: ChartPanelProps) {
  const {
    title,
    description,
    pool,
    options,
    defaultSelected,
    defaultTransform,
    fallbackTransforms = ['pct_yoy', 'level'],
    defaultAdjustment,
    defaultRange = '5y',
    kind = 'line',
    pickerLabel = 'Series',
    callout,
    extraNotes = [],
    synthetic = false,
  } = props;

  const uid = useId();
  const theme = useChartTheme();
  const [boxRef, width] = useElementWidth<HTMLDivElement>();
  const byId = useMemo(() => Object.fromEntries(pool.map((s) => [s.def.id, s])), [pool]);
  const optionSeries = useMemo(() => options.map((id) => byId[id]).filter((s): s is ClientSeries => !!s), [options, byId]);

  const initialSel = defaultSelected.filter((id) => byId[id]);
  const [selected, setSelected] = useState<string[]>(initialSel);
  const [slots, setSlots] = useState<Record<string, number>>(() => assignColorSlots(initialSel, {}));
  const [adjustment, setAdjustment] = useState<SeasonalAdjustment | null>(defaultAdjustment ?? null);
  const [transform, setTransform] = useState<TransformId>(defaultTransform);
  const [range, setRange] = useState<RangeId>(defaultRange);
  const [basePeriod, setBasePeriod] = useState<Period | null>(null);
  const [showTable, setShowTable] = useState(false);

  const selectedDefs = selected.map((id) => byId[id]!.def);
  const adjustments = availableAdjustments(selectedDefs, byId);
  const adj: SeasonalAdjustment | null = adjustments.length
    ? adjustment && adjustments.includes(adjustment)
      ? adjustment
      : adjustments.includes('original')
        ? 'original'
        : adjustments[0]!
    : null;

  // Series efectivas (variante según el ajuste elegido) y su ID base (para el color).
  const resolved = selected.map((id) => {
    const rid = resolveVariant(byId[id]!.def, adj);
    return { baseId: id, series: byId[rid] ?? byId[id]! };
  });
  const resolvedSeries = resolved.map((r) => r.series);
  const resolvedDefs = resolvedSeries.map((s) => s.def);

  const choices = transformChoices(resolvedDefs);
  const effTransform: TransformId | null = resolvedDefs.length ? pickTransform(resolvedDefs, transform, fallbackTransforms) : null;
  const transformSwapped = effTransform !== null && effTransform !== transform;

  const model = useMemo(
    () => (effTransform ? buildChartModel({ series: resolvedSeries, transform: effTransform, range, basePeriod }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedSeries.map((s) => s.def.id).join(','), effTransform, range, basePeriod, pool],
  );

  const colorSlots = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of resolved) out[r.series.def.id] = slots[r.baseId] ?? 0;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved.map((r) => r.series.def.id).join(','), slots]);

  const showAdjToggle = adjustments.length > 1 || selectedDefs.some((d) => d.seasonalVariants);
  const adjExtra = showAdjToggle && adj ? [adjustmentLabel(adj)] : [];
  const subtitle = model && !model.empty ? buildSubtitle(model, adjExtra) : '';
  const sourceLine = buildSourceLine(resolvedSeries, effTransform ?? 'level');
  const notes = collectNotes(resolvedSeries, extraNotes);
  const notices = seriesNotices(resolvedSeries);
  const kindEff = effTransform ? effectiveKind(kind, effTransform) : kind;

  const screenOption = useMemo(
    () => (model && !model.empty ? buildTimeSeriesOption({ model, kind, theme, colorSlots, mode: 'screen', width }) : null),
    [model, kind, theme, colorSlots, width],
  );

  const meta: ChartTextMeta = { title, subtitle, source: sourceLine, notes, synthetic };

  const toggleSeries = (id: string) => {
    let next: string[];
    if (selected.includes(id)) next = selected.filter((x) => x !== id);
    else next = [...selected, id];
    if (!next.length) return; // siempre al menos una serie
    setSelected(next);
    setSlots(assignColorSlots(next, slots));
  };

  const tableId = `${uid}-tabla`;
  const multiPicker = optionSeries.length > 1;

  return (
    <section className="panel" aria-labelledby={`${uid}-t`}>
      <header className="panel-head">
        <h2 id={`${uid}-t`}>{title}</h2>
        {description && <p className="panel-desc">{description}</p>}
        {callout && <p className="callout">{callout}</p>}
      </header>

      <div className="controls">
        <Segmented label="Rango" value={range} options={RANGE_IDS.map((r) => ({ value: r, label: RANGE_LABELS[r] }))} onChange={setRange} />
        {showAdjToggle && adj && (
          <Segmented
            label="Ajuste estacional"
            value={adj}
            options={(['original', 'desestacionalizada', 'tendencia-ciclo'] as SeasonalAdjustment[]).map((a) => ({
              value: a,
              label: adjustmentLabel(a),
              disabled: !adjustments.includes(a),
              title: adjustments.includes(a) ? undefined : 'No disponible para todas las series seleccionadas',
            }))}
            onChange={(a) => setAdjustment(a)}
          />
        )}
        {effTransform && (
          <Select
            label="Transformación"
            value={effTransform}
            options={choices.map((c) => ({ value: c.id, label: c.label, disabled: !c.enabled }))}
            onChange={(t) => {
              setTransform(t);
              setBasePeriod(null);
            }}
            hint={
              <>
                {TRANSFORMS[effTransform].description}
                {transformSwapped && (
                  <span className="hint-warn">
                    {' '}
                    «{choices.find((c) => c.id === transform)?.label ?? transform}» no es válida para la selección actual
                    {choices.find((c) => c.id === transform)?.reason ? `: ${choices.find((c) => c.id === transform)!.reason}` : '.'}
                  </span>
                )}
              </>
            }
          />
        )}
        {effTransform === 'rebase_100' && model && model.baseCandidates.length > 0 && (
          <Select
            label="Período base (= 100)"
            value={model.basePeriod ?? model.baseCandidates[0]!}
            options={[...model.baseCandidates].reverse().map((p) => ({ value: p, label: formatPeriodLong(p) }))}
            onChange={(p) => setBasePeriod(p)}
          />
        )}
      </div>

      {multiPicker && (
        <fieldset className="ctl picker">
          <legend>
            {pickerLabel} <span className="muted">(hasta {MAX_SERIES}; misma frecuencia y unidad)</span>
          </legend>
          <div className="picker-row">
            {optionSeries.map((s) => {
              const on = selected.includes(s.def.id);
              const others = resolvedDefs.filter((d) => d.id !== resolveVariant(s.def, adj));
              const candDef = byId[resolveVariant(s.def, adj)]?.def ?? s.def;
              const comp = effTransform ? compatibility(candDef, others, effTransform) : { ok: true };
              const full = !on && selected.length >= MAX_SERIES;
              const disabled = (!on && (!comp.ok || full)) || s.missing;
              const slot = slots[s.def.id];
              return (
                <label
                  key={s.def.id}
                  className={`chip${on ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`}
                  title={s.missing ? 'Sin datos en el store' : full ? `Máximo ${MAX_SERIES} series` : comp.reason ?? s.def.name}
                >
                  <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggleSeries(s.def.id)} />
                  <span className="chip-swatch" style={on && slot !== undefined ? { background: theme.series[slot] } : undefined} aria-hidden="true" />
                  <span>{s.def.shortName}</span>
                  {s.stale && <span className="badge badge-stale">datos anteriores</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="chart-meta">
        {subtitle && <p className="chart-subtitle">{subtitle}</p>}
        {kindEff !== kind && <p className="muted small">Con esta transformación se muestran líneas (las barras apiladas solo suman magnitudes aditivas).</p>}
      </div>

      <Notices notices={notices} />

      <div ref={boxRef} className="chart-box">
        {model && !model.empty ? (
          <EChart option={screenOption} ariaLabel={`${title}. ${subtitle}. Los valores están disponibles en la tabla de datos.`} />
        ) : (
          <div className="chart-empty" role="status">
            {resolvedSeries.every((s) => s.missing)
              ? 'Sin datos en el store para esta selección. Ejecutá `npm run data:refresh` para descargarlos.'
              : 'No hay valores para la transformación y el rango elegidos (p.ej. falta el período de comparación).'}
          </div>
        )}
      </div>

      <p className="muted small">Último dato publicado — {lastPeriodsLine(resolvedSeries) || 's/d'}</p>

      <ChartToolbar
        title={title}
        showTable={showTable}
        onToggleTable={() => setShowTable((v) => !v)}
        tableId={tableId}
        disabled={!model || model.empty}
        getCsv={() => (model ? toCsv({ periods: model.periods, columns: model.columns.map((c) => ({ header: csvHeader(c.header, model.basePeriod, model.transform), values: c.values })) }) : '')}
        getExportOption={() => (model && !model.empty ? exportTimeSeriesOption({ model, kind, colorSlots, meta }) : null)}
      />

      <div id={tableId} hidden={!showTable}>
        {showTable && model && !model.empty && (
          <div className="table-scroll" tabIndex={0} role="region" aria-label={`Tabla de datos: ${title}`}>
            <table className="data-table">
              <caption>
                {title}. {subtitle}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Período</th>
                  {model.columns.map((c) => (
                    <th scope="col" key={c.id}>
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.periods
                  .map((p, i) => ({ p, i }))
                  .reverse()
                  .map(({ p, i }) => (
                    <tr key={p}>
                      <th scope="row">{formatPeriodShort(p)}</th>
                      {model.columns.map((c) => (
                        <td key={c.id}>{formatNumber(c.values[i], decimalsForUnit(model.unit))}</td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SourceFooter source={sourceLine} sources={uniqueSources(resolvedSeries)} notes={notes} />
    </section>
  );
}

function csvHeader(header: string, base: Period | null, t: TransformId): string {
  return t === 'rebase_100' && base ? `${header} [base ${base} = 100]` : header;
}
