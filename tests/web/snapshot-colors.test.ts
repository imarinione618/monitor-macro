import { describe, expect, it } from 'vitest';
import { buildSnapshotModel } from '@/web/lib/chartModel';
import { buildSnapshotOption, exportSnapshotOption } from '@/web/lib/chartOptions';
import { DARK_THEME, LIGHT_THEME } from '@/web/lib/palette';
import { snapshotValueColor } from '@/web/lib/snapshotColors';
import { fakeSeries } from './helpers';

describe('colores de comparaciones interanuales', () => {
  it('distingue subas, bajas, cero y faltantes; la referencia siempre es gris', () => {
    for (const theme of [LIGHT_THEME, DARK_THEME]) {
      expect(snapshotValueColor(3, false, 'pct_yoy', theme)).toBe('#1A4CC8');
      expect(snapshotValueColor(-3, false, 'pct_yoy', theme)).toBe('#E32D91');
      expect(snapshotValueColor(0, false, 'pct_yoy', theme)).toBe('#969696');
      expect(snapshotValueColor(null, false, 'pct_yoy', theme)).toBe(theme.muted);
      expect(snapshotValueColor(-3, true, 'pct_yoy', theme)).toBe('#969696');
      expect(snapshotValueColor(3, true, 'pct_yoy', theme)).toBe('#969696');
      expect(snapshotValueColor(3, false, 'ytd_avg_pct_yoy', theme)).toBe('#1A4CC8');
      expect(snapshotValueColor(3, false, 'pct_prev', theme)).toBe(theme.series[0]);
    }
  });

  it('pantalla y exportación aplican la misma regla a las barras por sector', () => {
    const inputs = [
      fakeSeries('actividad.emae.total.orig', '2024-01', '2025-01', (i) => 100 + i),
      fakeSeries('actividad.emae_sector.agro.orig', '2024-01', '2025-01', (i) => 100 + 2 * i),
      fakeSeries('actividad.emae_sector.industria.orig', '2024-01', '2025-01', (i) => 100 - i),
    ];
    const snap = buildSnapshotModel(inputs, 'pct_yoy', '2025-01', inputs[0]!.def.id)!;
    const opts = [buildSnapshotOption({ snap, theme: LIGHT_THEME, mode: 'screen' }), exportSnapshotOption({ snap, meta: { title: 'Sectores', subtitle: 'Variación interanual', source: 'INDEC' } })];
    for (const option of opts) {
      const bars = option.series as { data: { itemStyle: { color: string } }[] }[];
      expect(bars[0]!.data.map((r) => r.itemStyle.color)).toEqual(snap.rows.map((r) => r.isReference ? '#969696' : r.value! > 0 ? '#1A4CC8' : '#E32D91'));
    }
  });
});
