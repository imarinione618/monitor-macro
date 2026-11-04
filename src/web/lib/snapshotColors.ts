import type { TransformId } from '@/core/types';
import type { ChartTheme } from './palette';

const YEARLY_CHANGES: TransformId[] = ['pct_yoy', 'ytd_avg_pct_yoy', 'ytd_sum_pct_yoy', 'sum_12m_pct_yoy', 'diff_yoy_pp', 'diff_yoy_abs'];

/** Misma regla para barras, tablas y exportaciones; la referencia prevalece sobre el signo. */
export function snapshotValueColor(value: number | null, isReference: boolean, transform: TransformId, theme: ChartTheme): string {
  if (isReference) return theme.reference;
  if (value === null) return theme.muted;
  if (!YEARLY_CHANGES.includes(transform)) return theme.series[0]!;
  return value > 0 ? '#1A4CC8' : value < 0 ? '#E32D91' : '#969696';
}
