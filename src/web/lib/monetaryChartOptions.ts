import type { EChartsCoreOption } from 'echarts/core';
import { FONT_FAMILY, noteLine } from './chartOptions';
import {
  EXPORT_FONT, EXPORT_FONT_FAMILY, EXPORT_LEGEND_H, EXPORT_LEGEND_OVERRIDES, EXPORT_MARKS, EXPORT_PAD,
  exportFooter, exportGrid, exportHeaderHeight, exportTitle, NO_SPLIT_LINE,
} from './exportStyle';
import { formatNumber } from './format';
import { EXPORT_THEME, type ChartTheme } from './palette';
import { monetaryDate, type MonetaryChartModel } from './monetaryChartModel';

const esc = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function buildMonetaryChartOption({ model, title, theme, exportMode = false, kind = 'line' }: { model: MonetaryChartModel; title: string; theme: ChartTheme; exportMode?: boolean; kind?: 'line' | 'stacked' }): EChartsCoreOption {
  const t = exportMode ? EXPORT_THEME : theme;
  const pad = exportMode ? EXPORT_PAD : 8;
  const fs = exportMode ? EXPORT_FONT.text : 12;
  const top = exportMode ? exportHeaderHeight(title, model.exportSubtitle) : 8;
  const foot = exportMode ? exportFooter([noteLine(model.exportNote), model.source], t) : null;
  const multi = model.columns.length > 1;
  const stacked = kind === 'stacked';
  return {
    animation: !exportMode,
    backgroundColor: exportMode ? '#ffffff' : 'transparent',
    textStyle: { fontFamily: exportMode ? EXPORT_FONT_FAMILY : FONT_FAMILY, color: t.text, fontSize: fs },
    color: model.columns.map((_, i) => t.series[i % t.series.length]!),
    grid: foot ? exportGrid(top + (multi ? EXPORT_LEGEND_H : 0) + 4, foot.height) : { left: pad, right: pad, top: top + (multi ? 48 : 12), bottom: 12, containLabel: true },
    title: exportMode ? exportTitle(title, model.exportSubtitle, t) : undefined,
    legend: { show: multi, type: exportMode ? 'plain' : 'scroll', top, left: pad, right: pad, textStyle: { color: t.text, fontSize: fs }, selectedMode: false, ...(exportMode ? EXPORT_LEGEND_OVERRIDES : {}) },
    xAxis: { type: 'category', data: model.periods.map(monetaryDate), boundaryGap: stacked, axisLine: { lineStyle: { color: t.axis } }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: fs, hideOverlap: true } },
    yAxis: { type: 'value', scale: !stacked, axisLabel: { color: t.muted, fontSize: fs, formatter: (v: number) => formatNumber(v, Math.abs(v) < 10 ? 1 : 0) }, splitLine: exportMode ? NO_SPLIT_LINE : { lineStyle: { color: t.grid } } },
    series: model.columns.map((c, index) => ({
      id: c.series.def.id, name: c.series.def.shortName, type: stacked ? 'bar' : 'line', stack: stacked ? 'composicion' : undefined, data: c.values,
      showSymbol: model.periods.length <= 24, symbolSize: exportMode ? EXPORT_MARKS.symbol : 5, connectNulls: false, lineStyle: { width: exportMode ? EXPORT_MARKS.line : 2 },
      itemStyle: { color: t.series[index % t.series.length] }, barMaxWidth: exportMode ? EXPORT_MARKS.barMaxWidth : 24,
    })),
    tooltip: exportMode ? undefined : {
      trigger: 'axis', confine: true, backgroundColor: t.surface, borderColor: t.axis, textStyle: { color: t.text },
      formatter: (raw: unknown) => {
        const rows = (Array.isArray(raw) ? raw : [raw]) as { dataIndex: number; seriesIndex: number; value: number | null }[];
        const date = model.periods[rows[0]?.dataIndex ?? 0] ?? '';
        return `<b>${esc(monetaryDate(date))}</b><br/>` + rows.map(row => {
          const c = model.columns[row.seriesIndex]!;
          const point = c.points.find(p => p.period === date);
          return `${esc(c.series.def.shortName)}: <b>${formatNumber(row.value, 2)}</b>${point?.partial ? ' · parcial' : ''}${point ? ` · corte ${esc(monetaryDate(point.effectiveDate))}` : ''}`;
        }).join('<br/>') + `<br/><span>${esc(model.unit)}</span>`;
      },
    },
    graphic: foot?.graphic ?? [],
  };
}
