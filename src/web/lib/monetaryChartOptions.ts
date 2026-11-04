import type { EChartsCoreOption } from 'echarts/core';
import { EXPORT_SIZE, FONT_FAMILY, headerHeight } from './chartOptions';
import { formatNumber } from './format';
import { EXPORT_THEME, type ChartTheme } from './palette';
import { monetaryDate, type MonetaryChartModel } from './monetaryChartModel';

const esc = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function buildMonetaryChartOption({ model, title, theme, exportMode = false, kind = 'line' }: { model: MonetaryChartModel; title: string; theme: ChartTheme; exportMode?: boolean; kind?: 'line' | 'stacked' }): EChartsCoreOption {
  const t = exportMode ? EXPORT_THEME : theme;
  const pad = exportMode ? 56 : 8;
  const fs = exportMode ? 17 : 12;
  const meta = { title, subtitle: model.subtitle, source: model.source };
  const top = exportMode ? headerHeight(meta, EXPORT_SIZE.width, pad) : 8;
  const multi = model.columns.length > 1;
  const stacked = kind === 'stacked';
  return {
    animation: !exportMode,
    backgroundColor: exportMode ? '#ffffff' : 'transparent',
    textStyle: { fontFamily: FONT_FAMILY, color: t.text, fontSize: fs },
    color: model.columns.map((_, i) => t.series[i % t.series.length]!),
    grid: { left: pad, right: pad, top: top + (multi ? 48 : 12), bottom: exportMode ? 100 : 12, containLabel: true },
    title: exportMode ? { text: title, subtext: model.subtitle, left: pad, top: 30, itemGap: 12, textStyle: { color: t.text, fontSize: 32, width: EXPORT_SIZE.width - pad * 2, overflow: 'break' }, subtextStyle: { color: t.textSecondary, fontSize: 19, width: EXPORT_SIZE.width - pad * 2, overflow: 'break' } } : undefined,
    legend: { show: multi, type: exportMode ? 'plain' : 'scroll', top, left: pad, right: pad, textStyle: { color: t.text, fontSize: fs }, selectedMode: false },
    xAxis: { type: 'category', data: model.periods.map(monetaryDate), boundaryGap: stacked, axisLine: { lineStyle: { color: t.axis } }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: fs, hideOverlap: true } },
    yAxis: { type: 'value', scale: !stacked, axisLabel: { color: t.muted, fontSize: fs, formatter: (v: number) => formatNumber(v, Math.abs(v) < 10 ? 1 : 0) }, splitLine: { lineStyle: { color: t.grid } } },
    series: model.columns.map((c, index) => ({
      id: c.series.def.id, name: c.series.def.shortName, type: stacked ? 'bar' : 'line', stack: stacked ? 'composicion' : undefined, data: c.values,
      showSymbol: model.periods.length <= 24, symbolSize: exportMode ? 8 : 5, connectNulls: false, lineStyle: { width: exportMode ? 3 : 2 },
      itemStyle: { color: t.series[index % t.series.length] }, barMaxWidth: exportMode ? 38 : 24,
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
    graphic: exportMode ? [{ type: 'text', left: pad, bottom: 30, style: { text: model.source, width: EXPORT_SIZE.width - pad * 2, overflow: 'break', fill: t.muted, font: `15px ${FONT_FAMILY}`, lineHeight: 21 } }] : [],
  };
}
