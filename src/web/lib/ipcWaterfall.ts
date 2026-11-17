/**
 * Cascada de incidencias del IPC por división: cada barra parte donde terminó la anterior (divisiones de mayor
 * a menor incidencia) y la última es la variación mensual del nivel general. Funciones puras.
 */
import type { EChartsCoreOption } from 'echarts/core';
import { formatPeriodLong } from '@/core/periods';
import type { Period } from '@/core/types';
import { FONT_FAMILY, noteLine } from './chartOptions';
import { CSV_BOM, CSV_SEP, csvNumber } from './csv';
import { EXPORT_FONT, EXPORT_FONT_FAMILY, EXPORT_MARKS, EXPORT_PAD, exportBase, exportFooter, exportGrid, exportHeaderHeight, exportTitle, NO_SPLIT_LINE } from './exportStyle';
import { formatAxis, formatNumber } from './format';
import { EXPORT_THEME, type ChartTheme } from './palette';
import type { ClientSeries } from './types';

export interface WaterfallStep {
  id: string;
  name: string;
  value: number | null;
  /** Punto de partida de la barra (acumulado previo); 0 para el total. */
  start: number;
  isTotal: boolean;
}

export interface WaterfallModel {
  period: Period;
  periods: Period[];
  steps: WaterfallStep[];
  /** Suma de las incidencias de las divisiones con dato. */
  sum: number;
  total: number | null;
  /** Total − suma (redondeo de los índices publicados). */
  residual: number | null;
}

const valueAt = (s: ClientSeries, p: Period) => s.observations.find((o) => o.period === p)?.value ?? null;

/** `totalId`: serie con la variación del nivel general; el resto, incidencias por división. */
export function buildWaterfallModel(series: ClientSeries[], totalId: string, period: Period | null): WaterfallModel | null {
  const total = series.find((s) => s.def.id === totalId);
  const parts = series.filter((s) => s.def.id !== totalId && !s.missing);
  if (!total || !parts.length) return null;
  const periods = total.observations
    .filter((o) => o.value !== null && parts.some((s) => valueAt(s, o.period) !== null))
    .map((o) => o.period)
    .sort();
  if (!periods.length) return null;
  const p = period && periods.includes(period) ? period : periods.at(-1)!;
  const items = parts.map((s) => ({ id: s.def.id, name: s.def.shortName, value: valueAt(s, p) })).sort((a, b) => {
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return b.value - a.value;
  });
  let cum = 0;
  const steps: WaterfallStep[] = items.map((it) => {
    const step = { ...it, start: cum, isTotal: false };
    if (it.value !== null) cum += it.value;
    return step;
  });
  const t = valueAt(total, p);
  steps.push({ id: totalId, name: 'Inflación del mes', value: t, start: 0, isTotal: true });
  return { period: p, periods, steps, sum: cum, total: t, residual: t === null ? null : t - cum };
}

export function waterfallCsv(model: WaterfallModel): string {
  const head = ['concepto', 'periodo', 'incidencia (p.p.)', 'desde (p.p.)', 'hasta (p.p.)'];
  const lines = model.steps.map((s) => [s.name.replace(/;/g, ','), model.period, csvNumber(s.value), csvNumber(s.start), csvNumber(s.value === null ? null : s.start + s.value)]);
  return CSV_BOM + [head, ...lines].map((l) => l.join(CSV_SEP)).join('\r\n') + '\r\n';
}

export interface WaterfallOptionInput {
  model: WaterfallModel;
  theme: ChartTheme;
  exportMeta?: { title: string; subtitle: string; note?: string; source: string };
}

/** Barras horizontales flotantes: base invisible + tramo visible, apiladas con `stackStrategy: 'all'` (admite incidencias negativas). */
export function buildWaterfallOption({ model, theme, exportMeta }: WaterfallOptionInput): EChartsCoreOption {
  const exp = !!exportMeta;
  const fs = exp ? EXPORT_FONT.text : 12;
  const ff = exp ? EXPORT_FONT_FAMILY : FONT_FAMILY;
  const foot = exp ? exportFooter([noteLine(exportMeta!.note), exportMeta!.source], theme) : null;
  const steps = model.steps;
  const color = (s: WaterfallStep) => (s.isTotal ? theme.reference : s.value !== null && s.value < 0 ? theme.series[1]! : theme.series[0]!);
  const fmt = (v: number | null) => (v === null ? 's/d' : `${formatNumber(v, 2)} p.p.`);

  const option: Record<string, unknown> = {
    ...(exp ? exportBase(theme) : { animation: true, backgroundColor: 'transparent', textStyle: { fontFamily: FONT_FAMILY, color: theme.textSecondary, fontSize: fs } }),
    grid: exp ? exportGrid(exportHeaderHeight(exportMeta!.title, exportMeta!.subtitle), foot?.height ?? EXPORT_PAD, { right: 40 }) : { left: 8, right: 72, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { color: theme.muted, fontSize: fs, fontFamily: ff, formatter: (v: number) => formatAxis(v) },
      splitLine: exp ? NO_SPLIT_LINE : { lineStyle: { color: theme.grid, width: 1 } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: steps.map((s) => s.name),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: theme.axis } },
      axisLabel: { color: theme.text, fontSize: fs, fontFamily: ff, fontWeight: (v: string) => (steps.find((s) => s.name === v)?.isTotal ? 600 : 400) },
    },
    series: [
      {
        type: 'bar',
        name: 'base',
        stack: 'cascada',
        stackStrategy: 'all',
        silent: true,
        animation: !exp,
        itemStyle: { color: 'transparent' },
        emphasis: { disabled: true },
        data: steps.map((s) => (s.value === null ? null : s.start)),
        barMaxWidth: exp ? EXPORT_MARKS.barMaxWidth : 18,
      },
      {
        type: 'bar',
        name: 'Incidencia',
        stack: 'cascada',
        stackStrategy: 'all',
        animation: !exp,
        barMaxWidth: exp ? EXPORT_MARKS.barMaxWidth : 18,
        data: steps.map((s) => ({ value: s.value, itemStyle: { color: color(s) } })),
        label: {
          show: true,
          position: 'right',
          color: theme.text,
          fontSize: fs,
          fontFamily: ff,
          formatter: (p: { value: unknown }) => (typeof p.value === 'number' ? formatNumber(p.value, 2) : ''),
        },
      },
    ],
  };
  if (!exp) {
    option.tooltip = {
      trigger: 'item',
      confine: true,
      backgroundColor: theme.surface,
      borderColor: theme.axis,
      textStyle: { color: theme.text, fontSize: 12, fontFamily: FONT_FAMILY },
      formatter: (p: { dataIndex: number; seriesName: string }) => {
        const s = steps[p.dataIndex];
        if (!s || p.seriesName === 'base') return '';
        const extra = s.isTotal
          ? `Suma de divisiones: ${fmt(model.sum)}${model.residual !== null ? ` · redondeo: ${formatNumber(model.residual, 2, { signed: true })}` : ''}`
          : `Acumulado: ${fmt(s.value === null ? null : s.start + s.value)}`;
        return `<div style="font-weight:600">${s.name}</div><div>${formatPeriodLong(model.period)}</div><div><b>${s.isTotal ? `${formatNumber(s.value, 2)} %` : fmt(s.value)}</b></div><div style="color:${theme.muted}">${extra}</div>`;
      },
    };
  }
  if (exp) {
    option.title = [exportTitle(exportMeta!.title, exportMeta!.subtitle, theme)];
    option.graphic = foot?.graphic ?? [];
  }
  return option as EChartsCoreOption;
}

export const exportWaterfallOption = (input: Omit<WaterfallOptionInput, 'theme'> & { exportMeta: NonNullable<WaterfallOptionInput['exportMeta']> }) =>
  buildWaterfallOption({ ...input, theme: EXPORT_THEME });
