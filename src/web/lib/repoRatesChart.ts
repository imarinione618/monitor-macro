/**
 * Gráfico combinado del tab Tasas: saldo de Repo BCRA (área, eje izquierdo, billones de ARS)
 * con tasa de caución a 1 día (A3) y TAMAR (líneas, eje derecho, % TNA).
 *
 * Cada serie se dibuja solo en sus propias fechas publicadas (eje temporal): no se completan
 * días ni se arrastran valores. La tabla y el CSV usan la unión de fechas con celdas vacías.
 */
import type { EChartsCoreOption } from 'echarts/core';
import type { MonetarySeries } from '@/monetary/types';
import { EXPORT_SIZE, FONT_FAMILY, headerHeight } from './chartOptions';
import { CSV_BOM, CSV_SEP, csvNumber } from './csv';
import { formatNumber } from './format';
import { monetaryDate, monetarySourceLabel } from './monetaryChartModel';
import { EXPORT_THEME, type ChartTheme } from './palette';

export const REPO_BCRA_ID = 198;
export const TAMAR_BCRA_ID = 44;
export const CAUCION_SERIES_ID = 'monetario.a3.caucion';
/** Millones de ARS → billones de ARS (10^12): solo para mostrar; lo almacenado no cambia. */
export const MILLONES_POR_BILLON = 1_000_000;

export type RepoRatesKey = 'repo' | 'caucion' | 'tamar';
export const REPO_RATES_LABELS: Record<RepoRatesKey, string> = { repo: 'Repo BCRA', caucion: 'Caución 1 día', tamar: 'TAMAR' };
export const REPO_RATES_UNITS: Record<RepoRatesKey, string> = { repo: 'billones de ARS', caucion: '% TNA', tamar: '% TNA' };

export interface RepoRatesSeries { key: RepoRatesKey; series: MonetarySeries; points: { date: string; value: number | null }[] }
export interface RepoRatesModel { dates: string[]; columns: RepoRatesSeries[]; subtitle: string; source: string }

export function pickRepoRatesSeries(all: MonetarySeries[]): Partial<Record<RepoRatesKey, MonetarySeries>> {
  return {
    repo: all.find(s => s.def.bcraId === REPO_BCRA_ID),
    caucion: all.find(s => s.def.id === CAUCION_SERIES_ID),
    tamar: all.find(s => s.def.bcraId === TAMAR_BCRA_ID),
  };
}

/** Primer día del año de la última observación de Repo: vista inicial comparable con el informe. */
export function defaultRepoRatesFrom(all: MonetarySeries[]): string {
  const last = pickRepoRatesSeries(all).repo?.observations.filter(o => o.value !== null).at(-1)?.date;
  return last ? `${last.slice(0, 4)}-01-01` : '';
}

export function buildRepoRatesModel(all: MonetarySeries[], range: { from?: string; to?: string; asOf?: string } = {}): RepoRatesModel {
  const picked = pickRepoRatesSeries(all);
  const inRange = (date: string) => (!range.from || date >= range.from) && (!range.to || date <= range.to) && (!range.asOf || date <= range.asOf);
  const columns: RepoRatesSeries[] = (['repo', 'caucion', 'tamar'] as const).flatMap(key => {
    const series = picked[key];
    if (!series) return [];
    const points = series.observations.filter(o => inRange(o.date)).map(o => ({ date: o.date, value: o.value === null ? null : key === 'repo' ? o.value / MILLONES_POR_BILLON : o.value }));
    return [{ key, series, points }];
  });
  const dates = [...new Set(columns.flatMap(c => c.points.map(p => p.date)))].sort();
  const span = dates.length ? `${monetaryDate(dates[0]!)}–${monetaryDate(dates.at(-1)!)}` : 'Sin observaciones';
  const subtitle = ['Diaria', 'Repo BCRA: saldo en billones de ARS (eje izq.)', 'Caución 1 día y TAMAR: % TNA (eje der.)', 'Valores nominales', span].join(' · ');
  const source = `${monetarySourceLabel(columns.map(c => c.series))}.`;
  return { dates, columns, subtitle, source };
}

/** Valor de cada serie en una fecha exacta (sin buscar la observación más cercana). */
export function repoRatesRow(model: RepoRatesModel, date: string): Record<RepoRatesKey, number | null | undefined> {
  const row = { repo: undefined, caucion: undefined, tamar: undefined } as Record<RepoRatesKey, number | null | undefined>;
  for (const c of model.columns) row[c.key] = c.points.find(p => p.date === date)?.value;
  return row;
}

function quote(value: string): string { return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value; }

export function repoRatesCsv(model: RepoRatesModel): string {
  const maps = model.columns.map(c => new Map(c.points.map(p => [p.date, p.value])));
  const headers = ['fecha', ...model.columns.map(c => `${c.series.def.name} [${REPO_RATES_UNITS[c.key]}]`)];
  const lines = model.dates.map(date => [date, ...maps.map(m => csvNumber(m.get(date)))].map(quote).join(CSV_SEP));
  return CSV_BOM + [headers.map(quote).join(CSV_SEP), ...lines].join('\r\n') + '\r\n';
}

const esc = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const toTime = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
const fromTime = (time: number) => new Date(time).toISOString().slice(0, 10);
function shortDate(time: number): string {
  const d = new Date(time);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(2)}`;
}

/** BCRA publica saldos de Repo negativos ocasionales (p. ej. 30/01/2026): se muestran, no se recortan. */
const repoAxisMin = (v: { min: number }) => (v.min < 0 ? Math.floor(v.min) : 0);

export function repoRatesColors(t: ChartTheme): Record<RepoRatesKey, string> {
  return { repo: t.series[0]!, caucion: t.series[1]!, tamar: t.text };
}

export function buildRepoRatesOption({ model, title, theme, exportMode = false }: { model: RepoRatesModel; title: string; theme: ChartTheme; exportMode?: boolean }): EChartsCoreOption {
  const t = exportMode ? EXPORT_THEME : theme;
  const colors = repoRatesColors(t);
  const pad = exportMode ? 56 : 8;
  const fs = exportMode ? 17 : 12;
  const top = exportMode ? headerHeight({ title, subtitle: model.subtitle, source: model.source }, EXPORT_SIZE.width, pad) : 8;
  const axisName = { color: t.muted, fontSize: fs };
  return {
    animation: !exportMode,
    useUTC: true,
    backgroundColor: exportMode ? '#ffffff' : 'transparent',
    textStyle: { fontFamily: FONT_FAMILY, color: t.text, fontSize: fs },
    grid: { left: pad, right: pad, top: top + 72, bottom: exportMode ? 100 : 12, containLabel: true },
    title: exportMode ? { text: title, subtext: model.subtitle, left: pad, top: 30, itemGap: 12, textStyle: { color: t.text, fontSize: 32, width: EXPORT_SIZE.width - pad * 2, overflow: 'break' }, subtextStyle: { color: t.textSecondary, fontSize: 19, width: EXPORT_SIZE.width - pad * 2, overflow: 'break' } } : undefined,
    legend: { show: true, type: 'plain', top, left: pad, right: pad, textStyle: { color: t.text, fontSize: fs }, selectedMode: false,
      data: model.columns.map(c => ({ name: `${REPO_RATES_LABELS[c.key]}${c.key === 'repo' ? ' (eje izq.)' : ' (eje der.)'}`, icon: c.key === 'repo' ? 'rect' : 'roundRect' })) },
    xAxis: { type: 'time', axisLine: { lineStyle: { color: t.axis } }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { color: t.muted, fontSize: fs, hideOverlap: true, formatter: (v: number) => shortDate(v) } },
    yAxis: [
      { type: 'value', name: 'Billones de ARS', nameTextStyle: { ...axisName, align: 'left' }, min: repoAxisMin, position: 'left', axisLabel: { color: t.muted, fontSize: fs, formatter: (v: number) => formatNumber(v, 1) }, splitLine: { lineStyle: { color: t.grid } } },
      { type: 'value', name: '% TNA', nameTextStyle: { ...axisName, align: 'right' }, scale: true, position: 'right', axisLabel: { color: t.muted, fontSize: fs, formatter: (v: number) => formatNumber(v, 0) }, splitLine: { show: false } },
    ],
    series: model.columns.map(c => {
      const repo = c.key === 'repo';
      return {
        id: c.series.def.id, name: `${REPO_RATES_LABELS[c.key]}${repo ? ' (eje izq.)' : ' (eje der.)'}`, type: 'line', yAxisIndex: repo ? 0 : 1, z: repo ? 1 : 3,
        data: c.points.map(p => [toTime(p.date), p.value]), showSymbol: false, connectNulls: false,
        lineStyle: { width: repo ? 0 : exportMode ? 3.5 : 2, color: colors[c.key] },
        itemStyle: { color: colors[c.key] },
        areaStyle: repo ? { color: colors.repo, opacity: 0.9 } : undefined,
      };
    }),
    tooltip: exportMode ? undefined : {
      trigger: 'axis', confine: true, backgroundColor: t.surface, borderColor: t.axis, textStyle: { color: t.text },
      formatter: (raw: unknown) => {
        const first = (Array.isArray(raw) ? raw : [raw])[0] as { axisValue?: number; value?: [number, number | null] } | undefined;
        const time = first?.axisValue ?? first?.value?.[0];
        if (time == null) return '';
        const date = fromTime(time);
        const row = repoRatesRow(model, date);
        return `<b>${esc(monetaryDate(date))}</b><br/>` + model.columns.map(c => {
          const v = row[c.key];
          return `<span style="color:${colors[c.key]}">●</span> ${esc(REPO_RATES_LABELS[c.key])}: <b>${v == null ? 'sin dato' : formatNumber(v, 2)}</b> ${esc(REPO_RATES_UNITS[c.key])}`;
        }).join('<br/>');
      },
    },
    graphic: exportMode ? [{ type: 'text', left: pad, bottom: 30, style: { text: model.source, width: EXPORT_SIZE.width - pad * 2, overflow: 'break', fill: t.muted, font: `15px ${FONT_FAMILY}`, lineHeight: 21 } }] : [],
  };
}
