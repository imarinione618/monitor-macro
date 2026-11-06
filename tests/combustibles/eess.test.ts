import { describe, expect, it } from 'vitest';
import { eessId } from '../../src/combustibles/defs';
import { EessAccumulator, finalizeEess, parsePeriod, pickEessResources, readEessCsv } from '../../src/combustibles/eess';
import { eessAnualCsv, eessVigenteCsv, fixture, linesOf, type EessRow } from './helpers';

const SUPER = eessId('super', 'nacional');
const SUPER_CABA = eessId('super', 'caba');

async function aggregate(csv: string) {
  const acc = new EessAccumulator();
  const stats = await readEessCsv(linesOf(csv), acc, 'test');
  return { stats, out: finalizeEess(acc) };
}

describe('Res. 1104: período', () => {
  it('acepta periodo YYYY/MM y anio + mes', () => {
    expect(parsePeriod('2026/09')).toBe('2026-09');
    expect(parsePeriod(undefined, '2016', '01')).toBe('2016-01');
    expect(parsePeriod(undefined, '2016', '1')).toBe('2016-01');
    expect(parsePeriod('2026/13')).toBeNull();
    expect(parsePeriod('2026-09')).toBeNull();
    expect(parsePeriod(undefined, '16', '01')).toBeNull();
  });

  it('lee las muestras reales de ambos formatos de archivo', async () => {
    const vig = await aggregate(fixture('eess-vigente-muestra.csv'));
    expect(vig.stats.rows).toBe(4);
    const anual = await aggregate(fixture('eess-2016-muestra.csv'));
    expect(anual.stats.rows).toBe(4);
    expect([...vig.out.get(eessId('premium', 'nacional'))!, ...anual.out.get(eessId('gasoil_g2', 'nacional'))!].map(o => o.date)).toEqual(['2024-12', '2016-01']);
  });
});

describe('Res. 1104: promedio ponderado por volumen', () => {
  it('pondera por volumen, filtra canal y producto y separa CABA', async () => {
    const rows: EessRow[] = [
      { period: '2026/09', price: 2000, volume: 10 },
      { period: '2026/09', price: 2100, volume: 30 },
      { period: '2026/09', price: 2200, volume: 60, province: 'CAPITAL FEDERAL' },
      { period: '2026/09', price: 2300, volume: 20, province: 'CAPITAL FEDERAL' },
      { period: '2026/09', price: 2250, volume: 20, province: 'CAPITAL FEDERAL' },
      { period: '2026/09', price: 9000, volume: 1000, canal: 'Agro' },
      { period: '2026/09', price: 9000, volume: 1000, product: 'GNC' },
      { period: '2026/09', price: 9000, volume: 1000, product: 'Gas Oil Grado 2B' },
    ];
    const { stats, out } = await aggregate(eessVigenteCsv(rows));
    expect(stats).toMatchObject({ rows: 8, used: 5, otherChannelOrProduct: 3 });
    const expected = (2000 * 10 + 2100 * 30 + 2200 * 60 + 2300 * 20 + 2250 * 20) / 140;
    expect(out.get(SUPER)![0]!.value).toBeCloseTo(expected, 10);
    expect(out.get(SUPER)![0]!.n).toBe(5);
    expect(out.get(SUPER_CABA)![0]).toEqual({ date: '2026-09', value: (2200 * 60 + 2300 * 20 + 2250 * 20) / 100, n: 3 });
  });

  it('excluye volumen 0 o faltante, sin movimiento, precio ≤ 0 y outliers de precio y de volumen', async () => {
    const base = Array.from({ length: 5 }, (_, i): EessRow => ({ period: '2025/01', price: 1000 + i * 10, volume: 40 + i }));
    const rows: EessRow[] = [
      ...base,
      { period: '2025/01', price: 1000, volume: 0 },
      { period: '2025/01', price: 1000, volume: '' },
      { period: '2025/01', price: 1000, volume: 50, noMov: 'SI' },
      { period: '2025/01', price: 0, volume: 50 },
      { period: '2025/01', price: 1, volume: 50 },
      { period: '2025/01', price: 3000, volume: 50 },
      // Error de unidad: litros declarados como m³ (≫ 50 × mediana del volumen).
      { period: '2025/01', price: 1040, volume: 105_834 },
    ];
    const { stats, out } = await aggregate(eessAnualCsv(rows));
    expect(stats).toMatchObject({ badVolume: 2, noMovement: 1, badPrice: 1 });
    const expected = base.reduce((s, r) => s + Number(r.price) * Number(r.volume), 0) / base.reduce((s, r) => s + Number(r.volume), 0);
    expect(out.get(SUPER)![0]).toEqual({ date: '2025-01', value: expected, n: 5 });
  });

  it('publica null con menos de 3 registros válidos (nunca 0)', async () => {
    const { out } = await aggregate(eessVigenteCsv([
      { period: '2025/02', price: 1000, volume: 10 }, { period: '2025/02', price: 1000, volume: 10 }, { period: '2025/02', price: 1000, volume: 10 },
      { period: '2025/02', price: 1000, volume: 10, province: 'CAPITAL FEDERAL' },
    ]));
    expect(out.get(SUPER)![0]!.value).toBe(1000);
    expect(out.get(SUPER_CABA)![0]).toEqual({ date: '2025-02', value: null, n: 1 });
    expect(out.get(eessId('premium', 'nacional'))![0]).toEqual({ date: '2025-02', value: null, n: 0 });
  });

  it('elige los archivos anuales y el vigente desde package_show', () => {
    const picked = pickEessResources([
      { id: 'a', name: 'Precios EESS 2015', url: 'u2015' },
      { id: 'b', name: 'Precios EESS 2017', url: 'u2017' },
      { id: 'c', name: 'Precios EESS 2016', url: 'u2016' },
      { id: 'd', name: 'Precios EESS 2004 ', url: 'u2004' },
      { id: 'e', name: 'Volumenes en EESS', url: 'vol' },
      { id: 'vig', name: 'Precios EESS desde Diciembre2024', url: 'uvig' },
    ], 2016, 'vig');
    expect(picked).toEqual({ annual: [{ year: 2016, url: 'u2016' }, { year: 2017, url: 'u2017' }], vigente: 'uvig' });
  });
});
