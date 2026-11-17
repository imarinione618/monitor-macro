/**
 * Formato único de los gráficos descargados (PNG/SVG), pensado para pegar en Word/PowerPoint
 * como si se hubiera armado en Excel:
 *
 * - Tamaño 12,7 × 7,62 cm (5 × 3 pulgadas).
 * - Sin bordes ni líneas internas (sin grilla).
 * - Arial; título 12 pt, subtítulo 10 pt, resto 7 pt; títulos centrados.
 *
 * El lienzo se mide en px CSS a 96 px por pulgada (la convención de Office), así que 1 pt = 4/3 px
 * y el SVG de 480 × 288 px se inserta con 12,7 × 7,62 cm. El PNG se genera a 300 dpi
 * (1500 × 900 px) y lleva la resolución grabada (chunk pHYs) para insertarse con el mismo tamaño.
 */
import type { ChartTheme } from './palette';

const PX_PER_INCH = 96;
const CM_PER_INCH = 2.54;
/** pt → px CSS (1 pt = 1/72 pulgada). */
export const pt = (points: number) => (points * PX_PER_INCH) / 72;
const cm = (centimeters: number) => Math.round((centimeters / CM_PER_INCH) * PX_PER_INCH);

export const EXPORT_CM = { width: 12.7, height: 7.62 } as const;
/** 480 × 288 px CSS = 12,7 × 7,62 cm. */
export const EXPORT_SIZE = { width: cm(EXPORT_CM.width), height: cm(EXPORT_CM.height) } as const;
export const EXPORT_DPI = 300;
/** 300 dpi / 96 → PNG de 1500 × 900 px. */
export const EXPORT_PIXEL_RATIO = EXPORT_DPI / PX_PER_INCH;

export const EXPORT_FONT_FAMILY = 'Arial, Helvetica, sans-serif';
export const EXPORT_FONT = {
  title: pt(12),
  subtitle: pt(10),
  /** Ejes, leyenda, etiquetas, fuente y notas. */
  text: pt(7),
} as const;
const LINE = { title: Math.round(pt(12) * 1.2), subtitle: Math.round(pt(10) * 1.2), text: Math.round(pt(7) * 1.25) };

/** Margen exterior (px). */
export const EXPORT_PAD = 8;
/**
 * Margen derecho del área de trazado: la última etiqueta del eje X queda centrada en el borde
 * y `containLabel` no la contempla (p. ej. «02/11/2026» se cortaba). Media etiqueta de fecha a 7 pt.
 */
export const EXPORT_RIGHT = 28;
/** Alto reservado para una fila de leyenda. */
export const EXPORT_LEGEND_H = LINE.text + 6;
/** Trazos y marcadores proporcionales al tamaño chico (líneas de 1,5 pt como Excel). */
export const EXPORT_MARKS = { line: pt(1.5), symbol: 4, barMaxWidth: 14, legendLine: { w: 14, h: 2 }, legendBox: 7, legendGap: 10 } as const;

/** Líneas aproximadas que ocupa un texto (Arial: ~0,52 em por carácter promedio). */
export function estimateLines(text: string, widthPx: number, fontSize: number): number {
  const charsPerLine = Math.max(10, Math.floor(widthPx / (fontSize * 0.52)));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

const innerWidth = () => EXPORT_SIZE.width - EXPORT_PAD * 2;
const TITLE_GAP = 2;

/** Alto (px) que ocupan título y subtítulo, desde el borde superior. */
export function exportHeaderHeight(title: string, subtitle: string): number {
  const w = innerWidth();
  const sub = subtitle ? TITLE_GAP + estimateLines(subtitle, w, EXPORT_FONT.subtitle) * LINE.subtitle : 0;
  return EXPORT_PAD + estimateLines(title, w, EXPORT_FONT.title) * LINE.title + sub + 6;
}

/** Título y subtítulo centrados (12 pt / 10 pt), sin negrita. */
export function exportTitle(title: string, subtitle: string, theme: ChartTheme) {
  const width = innerWidth();
  return {
    text: title,
    subtext: subtitle,
    // Ancla en el centro del lienzo y texto centrado sobre el ancla ('center' + textAlign desplaza el bloque).
    left: EXPORT_SIZE.width / 2,
    top: EXPORT_PAD,
    textAlign: 'center',
    itemGap: TITLE_GAP,
    textStyle: { color: theme.text, fontSize: EXPORT_FONT.title, lineHeight: LINE.title, fontWeight: 'normal', fontFamily: EXPORT_FONT_FAMILY, width, overflow: 'break', align: 'center' },
    subtextStyle: { color: theme.textSecondary, fontSize: EXPORT_FONT.subtitle, lineHeight: LINE.subtitle, fontFamily: EXPORT_FONT_FAMILY, width, overflow: 'break', align: 'center' },
  };
}

/** Línea de fuente (y avisos) al pie, 7 pt. `height` es lo que hay que reservar abajo. */
export function exportFooter(lines: string[], theme: ChartTheme): { graphic: unknown[]; height: number } {
  const width = innerWidth();
  const blocks = lines.filter(Boolean);
  const n = blocks.reduce((acc, b) => acc + estimateLines(b, width, EXPORT_FONT.text), 0);
  const blockH = n * LINE.text;
  return {
    height: blockH + EXPORT_PAD + 4,
    graphic: [
      {
        type: 'text',
        left: EXPORT_PAD,
        top: EXPORT_SIZE.height - EXPORT_PAD - blockH,
        silent: true,
        style: { text: blocks.join('\n'), width, overflow: 'break', fill: theme.muted, font: `${EXPORT_FONT.text}px ${EXPORT_FONT_FAMILY}`, lineHeight: LINE.text },
      },
    ],
  };
}

/** Opciones comunes: fondo blanco, sin animación, Arial 7 pt. */
export function exportBase(theme: ChartTheme) {
  return {
    animation: false,
    backgroundColor: '#ffffff',
    textStyle: { fontFamily: EXPORT_FONT_FAMILY, color: theme.textSecondary, fontSize: EXPORT_FONT.text },
  };
}

/** Leyenda de una fila (o más, si no entra) bajo el título. */
export function exportLegend(top: number, theme: ChartTheme) {
  return {
    show: true,
    type: 'plain',
    top,
    left: 'center',
    itemWidth: EXPORT_MARKS.legendLine.w,
    itemHeight: EXPORT_MARKS.legendBox,
    itemGap: EXPORT_MARKS.legendGap,
    selectedMode: false,
    textStyle: { color: theme.text, fontSize: EXPORT_FONT.text, fontFamily: EXPORT_FONT_FAMILY },
  };
}

/** Ajustes a superponer sobre una leyenda de pantalla para la exportación (centrada, íconos chicos). */
export const EXPORT_LEGEND_OVERRIDES = {
  left: 'center',
  right: undefined,
  itemWidth: EXPORT_MARKS.legendLine.w,
  itemHeight: EXPORT_MARKS.legendBox,
  itemGap: EXPORT_MARKS.legendGap,
} as const;

/** Espacio para el nombre de un eje (p. ej. «% TNA») sobre el área de trazado. */
// ECharts ubica el nombre a 15 px (nameGap) sobre el área de trazado: hay que dejar ese hueco más una línea.
export const EXPORT_AXIS_NAME_H = LINE.text + 15;

/** Grilla del área de trazado: márgenes del formato y lugar para título, leyenda y pie. */
export function exportGrid(top: number, footerHeight: number, extra: { left?: number; right?: number } = {}) {
  return { left: extra.left ?? EXPORT_PAD, right: extra.right ?? EXPORT_RIGHT, top, bottom: footerHeight + 4, containLabel: true };
}

/** Etiquetas de ejes en 7 pt Arial. */
export function exportAxisLabel(theme: ChartTheme) {
  return { color: theme.muted, fontSize: EXPORT_FONT.text, fontFamily: EXPORT_FONT_FAMILY };
}

/** Sin líneas internas: la exportación no dibuja grilla. */
export const NO_SPLIT_LINE = { show: false } as const;

// ---------- PNG con resolución grabada ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Inserta (o reemplaza) el chunk pHYs de un PNG con la resolución indicada, para que Office
 * lo inserte con su tamaño físico (1500 px a 300 dpi = 12,7 cm) y no a 96 dpi.
 */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const type = (o: number) => String.fromCharCode(png[o + 4]!, png[o + 5]!, png[o + 6]!, png[o + 7]!);
  // Firma (8) + IHDR (4 largo + 4 tipo + 13 datos + 4 CRC) = 33.
  if (png.length < 33 || type(8) !== 'IHDR') throw new Error('PNG inválido');
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const cv = new DataView(chunk.buffer);
  cv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  cv.setUint32(8, ppm);
  cv.setUint32(12, ppm);
  chunk[16] = 1; // unidad: metro
  cv.setUint32(17, crc32(chunk.subarray(4, 17)));

  const parts: Uint8Array[] = [png.subarray(0, 33), chunk];
  let o = 33;
  while (o + 8 <= png.length) {
    const len = view.getUint32(o);
    const end = o + 12 + len;
    if (type(o) !== 'pHYs') parts.push(png.subarray(o, end));
    o = end;
  }
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
