/**
 * Render de exportación: instancia ECharts fuera de pantalla con tamaño fijo
 * (1600×900), fondo blanco y opciones propias de exportación (sin controles).
 */
import type { EChartsCoreOption } from 'echarts/core';
import { EXPORT_PIXEL_RATIO, EXPORT_SIZE } from './chartOptions';
import { echarts } from './echarts';

/** SVG como texto. Funciona en Node (ssr) y en el navegador. */
export function renderSvgString(option: EChartsCoreOption, size: { width: number; height: number } = EXPORT_SIZE): string {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: size.width, height: size.height });
  try {
    chart.setOption(option);
    return chart.renderToSVGString();
  } finally {
    chart.dispose();
  }
}

/** PNG (data URL) en alta resolución. Solo navegador: usa un <div> fuera de pantalla con renderer canvas. */
export function renderPngDataUrl(option: EChartsCoreOption, size: { width: number; height: number } = EXPORT_SIZE, pixelRatio = EXPORT_PIXEL_RATIO): string {
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;left:-30000px;top:0;width:${size.width}px;height:${size.height}px;pointer-events:none;`;
  div.setAttribute('aria-hidden', 'true');
  document.body.appendChild(div);
  const chart = echarts.init(div, undefined, { renderer: 'canvas', width: size.width, height: size.height, devicePixelRatio: pixelRatio });
  try {
    chart.setOption(option);
    return chart.getDataURL({ type: 'png', pixelRatio, backgroundColor: '#ffffff' });
  } finally {
    chart.dispose();
    div.remove();
  }
}

export function downloadBlob(content: BlobPart, mime: string, filename: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
