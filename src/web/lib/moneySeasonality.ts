/**
 * Estacionalidad de la demanda de dinero: variación % mensual real promedio del M2 privado por mes calendario.
 * Funciones puras. La variación real se calcula con `prepareSeries` (misma lógica que el resto de Monetario:
 * saldo mensual → deflactado por IPC nacional → var. % m/m; meses parciales excluidos).
 */
import type { EChartsCoreOption } from 'echarts/core';
import { prepareSeries, type IpcPoint } from '@/monetary/analytics';
import type { MonetarySeries } from '@/monetary/types';
import { FONT_FAMILY, noteLine } from './chartOptions';
import { CSV_BOM, CSV_SEP, csvNumber } from './csv';
import { EXPORT_FONT, EXPORT_FONT_FAMILY, EXPORT_LEGEND_H, EXPORT_MARKS, EXPORT_PAD, exportBase, exportFooter, exportGrid, exportHeaderHeight, exportLegend, exportTitle, NO_SPLIT_LINE } from './exportStyle';
import { formatAxis, formatNumber } from './format';
import { EXPORT_THEME, type ChartTheme } from './palette';

export const M2_PRIVADO_ID = 'monetario.m2.privado';
export const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const;

export interface MonthlyChange { period: string; year: number; month: number; value: number }
export type SeasonalityWindow = { kind: 'last'; years: number } | { kind: 'range'; from: number; to: number };

export interface SeasonalityRow {
  month: number;
  label: string;
  /** Promedio simple de las variaciones del mes en la ventana (null si no hay ninguna). */
  mean: number | null;
  count: number;
  years: number[];
  /** Variación del año de comparación (si se eligió uno). */
  compare: number | null;
}

export interface SeasonalityModel {
  rows: SeasonalityRow[];
  availableYears: number[];
  firstYear: number | null;
  lastYear: number | null;
  compareYear: number | null;
  /** Rango de años efectivamente usado (puede variar por mes con «últimos N años»). */
  usedFrom: number | null;
  usedTo: number | null;
}

/** Var. % m/m del M2 privado a precios constantes, solo meses completos con IPC publicado. */
export function realMonthlyChanges(series: MonetarySeries | undefined, ipc: IpcPoint[], mode: 'mean' | 'close', asOf?: string): MonthlyChange[] {
  if (!series) return [];
  return prepareSeries(series, { frequency: 'M', monthlyMode: mode, valueMode: 'real', transform: 'pct_mom', asOf }, ipc)
    .filter((p) => p.value !== null && Number.isFinite(p.value) && !p.partial)
    .map((p) => ({ period: p.period, year: Number(p.period.slice(0, 4)), month: Number(p.period.slice(5, 7)), value: p.value! }));
}

/**
 * «Últimos N años»: para cada mes, sus N variaciones más recientes (así todos los meses promedian la misma cantidad de años).
 * «Rango»: todos los años entre `from` y `to` inclusive que tengan dato para ese mes.
 */
export function buildSeasonality(changes: MonthlyChange[], window: SeasonalityWindow, compareYear: number | null = null): SeasonalityModel {
  const availableYears = [...new Set(changes.map((c) => c.year))].sort((a, b) => a - b);
  const byMonth = Array.from({ length: 12 }, (_, i) => changes.filter((c) => c.month === i + 1).sort((a, b) => a.year - b.year));
  const used: number[] = [];
  const rows = byMonth.map((list, i): SeasonalityRow => {
    const picked = window.kind === 'last' ? list.slice(-Math.max(1, window.years)) : list.filter((c) => c.year >= window.from && c.year <= window.to);
    used.push(...picked.map((c) => c.year));
    const mean = picked.length ? picked.reduce((a, c) => a + c.value, 0) / picked.length : null;
    return {
      month: i + 1,
      label: MONTH_LABELS[i]!,
      mean,
      count: picked.length,
      years: picked.map((c) => c.year),
      compare: compareYear === null ? null : (list.find((c) => c.year === compareYear)?.value ?? null),
    };
  });
  return {
    rows,
    availableYears,
    firstYear: availableYears[0] ?? null,
    lastYear: availableYears.at(-1) ?? null,
    compareYear,
    usedFrom: used.length ? Math.min(...used) : null,
    usedTo: used.length ? Math.max(...used) : null,
  };
}

export function windowLabel(model: SeasonalityModel, window: SeasonalityWindow): string {
  const span = model.usedFrom !== null ? (model.usedFrom === model.usedTo ? `${model.usedFrom}` : `${model.usedFrom}–${model.usedTo}`) : 's/d';
  return window.kind === 'last' ? `Promedio de los últimos ${window.years} años de cada mes (${span})` : `Promedio ${span}`;
}

/** CSV con las convenciones del proyecto (BOM, «;», coma decimal, sin redondear, faltante vacío). */
export function seasonalityCsv(model: SeasonalityModel, avgLabel: string): string {
  const head = ['mes', `${avgLabel} (%)`, 'años promediados', 'años', ...(model.compareYear !== null ? [`${model.compareYear} (%)`] : [])];
  const lines = model.rows.map((r) => [r.label, csvNumber(r.mean), String(r.count), r.years.join(' '), ...(model.compareYear !== null ? [csvNumber(r.compare)] : [])]);
  const quote = (s: string) => (/[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return CSV_BOM + [head, ...lines].map((l) => l.map(quote).join(CSV_SEP)).join('\r\n') + '\r\n';
}

export interface SeasonalityOptionInput {
  model: SeasonalityModel;
  theme: ChartTheme;
  avgLabel: string;
  exportMeta?: { title: string; subtitle: string; note?: string; source: string };
}

/** Barras verticales por mes (promedio) y, opcionalmente, barras del año de comparación. */
export function buildSeasonalityOption({ model, theme, avgLabel, exportMeta }: SeasonalityOptionInput): EChartsCoreOption {
  const exp = !!exportMeta;
  const fs = exp ? EXPORT_FONT.text : 12;
  const ff = exp ? EXPORT_FONT_FAMILY : FONT_FAMILY;
  const hasCompare = model.compareYear !== null;
  const foot = exp ? exportFooter([noteLine(exportMeta!.note), exportMeta!.source], theme) : null;
  const headerH = exp ? exportHeaderHeight(exportMeta!.title, exportMeta!.subtitle) : 8;
  const legendH = hasCompare ? (exp ? EXPORT_LEGEND_H : 28) : 0;
  const fmt = (v: unknown) => (typeof v === 'number' ? `${formatNumber(v, 1)} %` : 's/d');
  const avgName = avgLabel;
  const cmpName = hasCompare ? String(model.compareYear) : '';

  const option: Record<string, unknown> = {
    ...(exp ? exportBase(theme) : { animation: true, backgroundColor: 'transparent', textStyle: { fontFamily: FONT_FAMILY, color: theme.textSecondary, fontSize: fs } }),
    grid: exp ? exportGrid(headerH + legendH, foot?.height ?? EXPORT_PAD) : { left: 8, right: 16, top: 12 + legendH, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: model.rows.map((r) => r.label),
      axisTick: { show: false },
      axisLine: { onZero: true, lineStyle: { color: theme.axis } },
      axisLabel: { color: theme.text, fontSize: fs, fontFamily: ff },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: theme.muted, fontSize: fs, fontFamily: ff, formatter: (v: number) => formatAxis(v) },
      splitLine: exp ? NO_SPLIT_LINE : { lineStyle: { color: theme.grid, width: 1 } },
    },
    series: [
      {
        type: 'bar',
        name: avgName,
        barMaxWidth: exp ? EXPORT_MARKS.barMaxWidth : 28,
        animation: !exp,
        itemStyle: { color: theme.series[0] },
        data: model.rows.map((r) => r.mean),
        label: {
          show: !hasCompare,
          position: 'top',
          color: theme.text,
          fontSize: exp ? EXPORT_FONT.text : 11,
          fontFamily: ff,
          formatter: (p: { value: unknown }) => (typeof p.value === 'number' ? formatNumber(p.value, 1) : ''),
        },
        labelLayout: { hideOverlap: true },
      },
      ...(hasCompare
        ? [{ type: 'bar', name: cmpName, barMaxWidth: exp ? EXPORT_MARKS.barMaxWidth : 28, animation: !exp, itemStyle: { color: theme.series[1] }, data: model.rows.map((r) => r.compare) }]
        : []),
    ],
  };
  if (hasCompare)
    option.legend = exp
      ? { ...exportLegend(headerH, theme), data: [avgName, cmpName], itemWidth: EXPORT_MARKS.legendBox, itemHeight: EXPORT_MARKS.legendBox }
      : { top: 0, left: 0, data: [avgName, cmpName], textStyle: { color: theme.text, fontSize: 12, fontFamily: FONT_FAMILY } };
  if (!exp) {
    option.tooltip = {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      backgroundColor: theme.surface,
      borderColor: theme.axis,
      textStyle: { color: theme.text, fontSize: 12, fontFamily: FONT_FAMILY },
      formatter: (ps: { dataIndex: number }[]) => {
        const r = model.rows[ps[0]?.dataIndex ?? 0];
        if (!r) return '';
        const yrs = r.count ? `${r.count} años (${r.years[0]}–${r.years.at(-1)})` : 'sin datos';
        return `<div style="font-weight:600">${r.label}</div><div>${avgName}: <b>${fmt(r.mean)}</b></div><div style="color:${theme.muted}">${yrs}</div>${hasCompare ? `<div>${cmpName}: <b>${fmt(r.compare)}</b></div>` : ''}`;
      },
    };
  }
  if (exp) {
    option.title = [exportTitle(exportMeta!.title, exportMeta!.subtitle, theme)];
    option.graphic = foot?.graphic ?? [];
  }
  return option as EChartsCoreOption;
}

export const exportSeasonalityOption = (input: Omit<SeasonalityOptionInput, 'theme'> & { exportMeta: NonNullable<SeasonalityOptionInput['exportMeta']> }) =>
  buildSeasonalityOption({ ...input, theme: EXPORT_THEME });
