/**
 * Paleta violeta-rojo del dashboard, con los tres colores prioritarios del usuario.
 * Los colores identifican SERIES, nunca juicios (no hay "verde = bueno / rojo = malo").
 * Las subas y bajas se muestran con el mismo color; el signo lo da el número y el eje.
 */

export interface ChartTheme {
  surface: string;
  text: string;
  textSecondary: string;
  muted: string;
  grid: string;
  axis: string;
  series: readonly string[];
  /** Color neutro para una serie de referencia (p.ej. "Nivel general" en barras). */
  reference: string;
}

export const SERIES_PALETTE = ['#E32D91', '#1A4CC8', '#969696', '#7030A0', '#C00000', '#A674C5', '#F19BC6', '#8064A2'] as const;

export const LIGHT_THEME: ChartTheme = {
  surface: '#fcfcfb',
  text: '#0b0b0b',
  textSecondary: '#52514e',
  muted: '#6b6a65',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  series: SERIES_PALETTE,
  reference: '#52514e',
};

export const DARK_THEME: ChartTheme = {
  surface: '#1a1a19',
  text: '#f0efec',
  textSecondary: '#c3c2b7',
  muted: '#a3a199',
  grid: '#2c2c2a',
  axis: '#383835',
  series: SERIES_PALETTE,
  reference: '#c3c2b7',
};

/** Exportación (PowerPoint): siempre fondo blanco puro, independiente del tema de pantalla. */
export const EXPORT_THEME: ChartTheme = { ...LIGHT_THEME, surface: '#ffffff', muted: '#5f5e5a' };

export const MAX_SERIES = LIGHT_THEME.series.length;

/**
 * Asigna colores estables: una serie conserva su color mientras siga seleccionada
 * (el color sigue a la entidad, no a su posición). Devuelve un nuevo mapa id → slot.
 */
export function assignColorSlots(selected: readonly string[], previous: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  const used = new Set<number>();
  for (const id of selected) {
    const slot = previous[id];
    if (slot !== undefined && !used.has(slot)) {
      out[id] = slot;
      used.add(slot);
    }
  }
  for (const id of selected) {
    if (out[id] !== undefined) continue;
    let s = 0;
    while (used.has(s)) s++;
    out[id] = s;
    used.add(s);
  }
  return out;
}
