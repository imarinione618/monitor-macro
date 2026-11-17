/**
 * Opciones de ECharts (funciones puras): una versión "pantalla" (con tooltip, sin título:
 * el título lo pone el HTML) y una versión "exportación" para Word/PowerPoint con el formato
 * de `exportStyle.ts` (12,7 × 7,62 cm, Arial, títulos centrados, sin grilla, fondo blanco,
 * subtítulo con período y unidad, fuente al pie, sin controles ni animación).
 */
import type { EChartsCoreOption } from 'echarts/core';
import { formatPeriodLong, formatPeriodShort } from '@/core/periods';
import type { TransformId } from '@/core/types';
import { ADDITIVE_TRANSFORMS, type ChartModel, type SnapshotModel } from './chartModel';
import {
  EXPORT_FONT,
  EXPORT_FONT_FAMILY,
  EXPORT_LEGEND_H,
  EXPORT_MARKS,
  EXPORT_PAD,
  exportBase,
  exportFooter,
  exportGrid,
  exportHeaderHeight,
  exportLegend,
  exportTitle,
  NO_SPLIT_LINE,
} from './exportStyle';
import { formatAxis, formatWithUnit } from './format';
import { EXPORT_THEME, type ChartTheme } from './palette';
import type { ChartKind } from './types';
import { snapshotValueColor } from './snapshotColors';

export { EXPORT_PIXEL_RATIO, EXPORT_SIZE, estimateLines } from './exportStyle';
// Comillas simples: ECharts no escapa comillas dobles dentro del atributo style del SVG exportado.
export const FONT_FAMILY = "'Segoe UI', system-ui, -apple-system, Arial, Helvetica, sans-serif";
export const SYNTHETIC_WARNING = 'DATOS SINTÉTICOS DE PRUEBA — NO SON DATOS REALES';

export type RenderMode = 'screen' | 'export';

export interface ChartTextMeta {
  title: string;
  /** Transformación, unidad, ajuste y período cubierto. */
  subtitle: string;
  /** Línea de fuente (siempre visible en la exportación). */
  source: string;
  notes?: string[];
  synthetic?: boolean;
}

/** Subtítulo estándar: "Var. % interanual · Unidad: % · Desestacionalizada · ene-21 a ago-26". */
export function buildSubtitle(model: Pick<ChartModel, 'transformLabel' | 'unit' | 'periods' | 'transform' | 'basePeriod'>, extra: string[] = []): string {
  const parts = [model.transformLabel, `Unidad: ${model.unit}`, ...extra.filter(Boolean)];
  if (model.transform === 'rebase_100' && model.basePeriod) parts.push(`Base ${formatPeriodShort(model.basePeriod)} = 100`);
  const first = model.periods[0];
  const last = model.periods[model.periods.length - 1];
  if (first && last) parts.push(first === last ? formatPeriodLong(first) : `${formatPeriodShort(first)} a ${formatPeriodShort(last)}`);
  return parts.join(' · ');
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function isLevelLike(t: TransformId): boolean {
  return t === 'level' || t === 'rebase_100' || t === 'ytd_sum' || t === 'sum_12m';
}

/** Tipo efectivo: las barras apiladas solo tienen sentido con magnitudes aditivas. */
export function effectiveKind(kind: ChartKind, t: TransformId): ChartKind {
  if (kind === 'stacked' && !ADDITIVE_TRANSFORMS.includes(t)) return 'line';
  return kind;
}

/** Alto (px) que ocupan título y subtítulo en la exportación, según su largo. */
function headerHeight(meta: ChartTextMeta | undefined): number {
  return meta ? exportHeaderHeight(meta.title, meta.subtitle) : EXPORT_PAD;
}

/** Pie de exportación: fuente y, si corresponde, aviso de datos sintéticos. */
function footer(meta: ChartTextMeta, theme: ChartTheme) {
  return exportFooter([meta.source, meta.synthetic ? SYNTHETIC_WARNING : ''], theme);
}

export interface TimeSeriesOptionInput {
  model: ChartModel;
  kind: ChartKind;
  theme: ChartTheme;
  /** id de serie → slot de color (estable). */
  colorSlots: Record<string, number>;
  mode: RenderMode;
  meta?: ChartTextMeta;
  /** Ancho disponible en pantalla (para decidir etiquetas directas). */
  width?: number;
}

/** Opción ECharts para series temporales (líneas, barras o barras apiladas). */
export function buildTimeSeriesOption({ model, kind, theme, colorSlots, mode, meta, width }: TimeSeriesOptionInput): EChartsCoreOption {
  const exp = mode === 'export';
  const k = effectiveKind(kind, model.transform);
  const cols = model.columns;
  const multi = cols.length > 1;
  const W = width ?? 800;
  const pad = exp ? EXPORT_PAD : 8;
  const fs = exp ? EXPORT_FONT.text : 12;
  const ff = exp ? EXPORT_FONT_FAMILY : FONT_FAMILY;
  const color = (id: string) => theme.series[(colorSlots[id] ?? 0) % theme.series.length]!;
  const directLabels = k === 'line' && cols.length <= 4 && (exp || W >= 560);
  const crossesZero = cols.some((c) => c.values.some((v) => v !== null && v < 0)) && cols.some((c) => c.values.some((v) => v !== null && v > 0));
  const unit = model.unit;
  const periods = model.periods;

  const fmt = (v: unknown) => formatWithUnit(typeof v === 'number' ? v : null, unit);

  let top = exp ? headerHeight(meta) : 12;
  const legendTop = top;
  if (multi) top += exp ? EXPORT_LEGEND_H : 30;
  const foot = exp && meta ? footer(meta, theme) : null;

  const series = cols.map((c, i) => {
    const base = {
      id: c.id,
      name: c.name,
      data: c.values,
      color: color(c.id),
      emphasis: { focus: 'series' },
      animation: !exp,
    };
    if (k === 'line') {
      return {
        ...base,
        type: 'line',
        showSymbol: periods.length <= 24,
        symbol: 'circle',
        symbolSize: exp ? EXPORT_MARKS.symbol : 7,
        connectNulls: false,
        lineStyle: { width: exp ? EXPORT_MARKS.line : 2 },
        // Evita que las etiquetas finales de series cercanas se superpongan.
        labelLayout: { moveOverlap: 'shiftY' },
        endLabel: directLabels
          ? {
              show: true,
              formatter: (p: { value: unknown }) => formatWithUnit(typeof p.value === 'number' ? p.value : null, unit),
              color: theme.text,
              fontSize: fs,
              fontFamily: ff,
              distance: exp ? 3 : 6,
            }
          : { show: false },
        markLine:
          i === 0 && crossesZero
            ? { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: theme.axis, type: 'solid', width: 1 }, data: [{ yAxis: 0 }] }
            : undefined,
      };
    }
    return {
      ...base,
      type: 'bar',
      stack: k === 'stacked' ? 'total' : undefined,
      barMaxWidth: exp ? EXPORT_MARKS.barMaxWidth : 28,
      // Exportación sin bordes: las barras apiladas no llevan separador blanco.
      itemStyle: { borderColor: k === 'stacked' && !exp ? theme.surface : undefined, borderWidth: k === 'stacked' && !exp ? 1 : 0 },
    };
  });

  const longestEnd = directLabels
    ? Math.max(...cols.map((c) => fmt([...c.values].reverse().find((v) => v !== null) ?? null).length))
    : 0;
  const right = directLabels
    ? Math.min(exp ? 70 : 160, Math.round(longestEnd * fs * 0.6) + (exp ? 6 : 14))
    : exp ? pad : 12;

  const lineIcon = k === 'line';
  const option: Record<string, unknown> = {
    ...(exp ? exportBase(theme) : { animation: true, backgroundColor: 'transparent', textStyle: { fontFamily: FONT_FAMILY, color: theme.textSecondary, fontSize: fs } }),
    color: cols.map((c) => color(c.id)),
    grid: exp
      ? exportGrid(top + 4, foot?.height ?? EXPORT_PAD, { right })
      : { left: pad, right, top: top + 6, bottom: 8, containLabel: true },
    legend: !multi
      ? { show: false }
      : exp
        ? {
            ...exportLegend(legendTop, theme),
            icon: lineIcon ? 'roundRect' : 'rect',
            itemWidth: lineIcon ? EXPORT_MARKS.legendLine.w : EXPORT_MARKS.legendBox,
            itemHeight: lineIcon ? EXPORT_MARKS.legendLine.h : EXPORT_MARKS.legendBox,
          }
        : {
            show: true,
            type: 'scroll',
            top: legendTop,
            left: pad,
            right: pad,
            icon: lineIcon ? 'roundRect' : 'rect',
            itemWidth: lineIcon ? 16 : 12,
            itemHeight: lineIcon ? 3 : 12,
            itemGap: 14,
            textStyle: { color: theme.text, fontSize: fs, fontFamily: FONT_FAMILY },
            inactiveColor: theme.axis,
            selectedMode: true,
          },
    xAxis: {
      type: 'category',
      data: periods.map(formatPeriodShort),
      boundaryGap: k !== 'line',
      axisLine: { lineStyle: { color: theme.axis } },
      axisTick: { show: false },
      axisLabel: { color: theme.muted, fontSize: fs, hideOverlap: true, fontFamily: ff },
    },
    yAxis: {
      type: 'value',
      scale: k === 'line' && isLevelLike(model.transform) && !crossesZero,
      axisLabel: { color: theme.muted, fontSize: fs, formatter: (v: number) => formatAxis(v), fontFamily: ff },
      splitLine: exp ? NO_SPLIT_LINE : { lineStyle: { color: theme.grid, width: 1, type: 'solid' } },
      axisLine: { show: false },
    },
    series,
  };

  if (!exp) {
    option.tooltip = {
      trigger: 'axis',
      confine: true,
      backgroundColor: theme.surface,
      borderColor: theme.axis,
      textStyle: { color: theme.text, fontSize: 12, fontFamily: FONT_FAMILY },
      axisPointer: { type: k === 'line' ? 'line' : 'shadow', lineStyle: { color: theme.axis } },
      formatter: (raw: unknown) => {
        const params = (Array.isArray(raw) ? raw : [raw]) as { dataIndex: number; seriesName: string; value: unknown; color: string }[];
        const idx = params[0]?.dataIndex ?? 0;
        const p = periods[idx];
        const head = p ? `<div style="font-weight:600;margin-bottom:4px">${esc(formatPeriodLong(p))}</div>` : '';
        const rows = params
          .map(
            (x) =>
              `<div style="display:flex;gap:8px;align-items:center;justify-content:space-between"><span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${x.color};margin-right:6px"></span>${esc(
                x.seriesName,
              )}</span><b style="font-variant-numeric:tabular-nums">${esc(fmt(x.value))}</b></div>`,
          )
          .join('');
        let total = '';
        if (k === 'stacked' && params.length > 1) {
          const vals = params.map((x) => (typeof x.value === 'number' ? x.value : null));
          const sum = vals.every((v) => v !== null) ? vals.reduce<number>((a, b) => a + (b ?? 0), 0) : null;
          total = `<div style="border-top:1px solid ${theme.grid};margin-top:4px;padding-top:4px;display:flex;justify-content:space-between"><span>Suma de lo seleccionado</span><b>${esc(fmt(sum))}</b></div>`;
        }
        return `${head}${rows}${total}<div style="color:${theme.muted};margin-top:4px">${esc(unit)}</div>`;
      },
    };
  }

  if (exp && meta) {
    option.title = [exportTitle(meta.title, meta.subtitle, theme)];
    option.graphic = foot?.graphic ?? [];
  }
  return option as EChartsCoreOption;
}

export interface SnapshotOptionInput {
  snap: SnapshotModel;
  theme: ChartTheme;
  mode: RenderMode;
  meta?: ChartTextMeta;
}

/** Barras horizontales para un corte en un período (p.ej. sectores del EMAE, último mes). */
export function buildSnapshotOption({ snap, theme, mode, meta }: SnapshotOptionInput): EChartsCoreOption {
  const exp = mode === 'export';
  const fs = exp ? EXPORT_FONT.text : 12;
  const ff = exp ? EXPORT_FONT_FAMILY : FONT_FAMILY;
  const rows = snap.rows;
  const foot = exp && meta ? footer(meta, theme) : null;
  const fmt = (v: number | null) => formatWithUnit(v, snap.unit);

  const option: Record<string, unknown> = {
    ...(exp ? exportBase(theme) : { animation: true, backgroundColor: 'transparent', textStyle: { fontFamily: FONT_FAMILY, color: theme.textSecondary, fontSize: fs } }),
    grid: exp ? exportGrid(headerHeight(meta), foot?.height ?? EXPORT_PAD, { right: 40 }) : { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { color: theme.muted, fontSize: fs, formatter: (v: number) => formatAxis(v), fontFamily: ff },
      splitLine: exp ? NO_SPLIT_LINE : { lineStyle: { color: theme.grid, width: 1 } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map((r) => r.name),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: theme.axis } },
      axisLabel: {
        color: theme.text,
        fontSize: fs,
        fontFamily: ff,
        fontWeight: (v: string) => (rows.find((r) => r.name === v)?.isReference ? 600 : 400),
      },
    },
    series: [
      {
        type: 'bar',
        name: snap.transformLabel,
        barMaxWidth: exp ? EXPORT_MARKS.barMaxWidth : 18,
        animation: !exp,
        data: rows.map((r) => ({
          value: r.value,
          itemStyle: { color: snapshotValueColor(r.value, r.isReference, snap.transform, theme) },
        })),
        label: {
          show: true,
          position: 'right',
          color: theme.text,
          fontSize: fs,
          fontFamily: ff,
          formatter: (p: { value: unknown }) => fmt(typeof p.value === 'number' ? p.value : null),
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
      formatter: (p: { dataIndex: number; value: unknown }) => {
        const r = rows[p.dataIndex];
        return `<div style="font-weight:600">${esc(r?.name ?? '')}</div><div>${esc(formatPeriodLong(snap.period))}</div><div><b>${esc(
          fmt(typeof p.value === 'number' ? p.value : null),
        )}</b> <span style="color:${theme.muted}">${esc(snap.transformLabel)}</span></div>`;
      },
    };
  }
  if (exp && meta) {
    option.title = [exportTitle(meta.title, meta.subtitle, theme)];
    option.graphic = foot?.graphic ?? [];
  }
  return option as EChartsCoreOption;
}

/** Atajo: opción de exportación con el tema blanco fijo. */
export function exportTimeSeriesOption(input: Omit<TimeSeriesOptionInput, 'theme' | 'mode'> & { meta: ChartTextMeta }): EChartsCoreOption {
  return buildTimeSeriesOption({ ...input, theme: EXPORT_THEME, mode: 'export' });
}

export function exportSnapshotOption(input: Omit<SnapshotOptionInput, 'theme' | 'mode'> & { meta: ChartTextMeta }): EChartsCoreOption {
  return buildSnapshotOption({ ...input, theme: EXPORT_THEME, mode: 'export' });
}
