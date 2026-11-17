import { describe, expect, it } from 'vitest';
import { readSeriesData } from '../../src/core/store';

const map = (id: string) => new Map((readSeriesData(`cambiario.${id}`)?.observations ?? []).map((o) => [o.period, o.value]));
const real = readSeriesData('cambiario.resultado.cuenta_corriente');
/** Suma de componentes; los faltantes (concepto no informado antes de 2017-07) cuentan como ausentes, no como 0 publicado. */
const sumAt = (maps: Map<string, number | null>[], p: string) => maps.reduce((acc, m) => acc + (m.get(p) ?? 0), 0);

describe.skipIf(!real)('balance cambiario (store real) — identidades contables del BCRA', () => {
  it('cuenta corriente + capital y financiera + no informado = variación de reservas por transacciones', () => {
    const parts = ['resultado.cuenta_corriente', 'resultado.capital_financiera', 'resultado.no_informado'].map(map);
    let n = 0;
    for (const [p, v] of map('reservas.transacciones')) {
      if (v === null) continue;
      n++;
      expect(Math.abs(sumAt(parts, p) - v), p).toBeLessThan(0.5);
    }
    expect(n).toBeGreaterThan(200);
  });

  it('transacciones + ajuste por pase y valuación = variación contable', () => {
    const t = map('reservas.transacciones'), a = map('reservas.ajuste');
    for (const [p, v] of map('reservas.contable')) if (v !== null) expect(Math.abs(t.get(p)! + a.get(p)! - v), p).toBeLessThan(0.5);
  });

  it('bienes + servicios + ingreso primario + ingreso secundario = cuenta corriente', () => {
    const parts = ['cc.bienes', 'cc.servicios', 'cc.ingreso_primario', 'cc.ingreso_secundario'].map(map);
    for (const [p, v] of map('resultado.cuenta_corriente')) if (v !== null) expect(Math.abs(sumAt(parts, p) - v), p).toBeLessThan(0.5);
  });

  it('los conceptos de la cuenta financiera más la cuenta de capital = cuenta capital y financiera', () => {
    const ids = ['fae_spnf', 'inversion_directa', 'portafolio', 'prestamos', 'fmi', 'org_int', 'sector_publico', 'fae_financiero', 'fae_publico', 'titulos', 'canje', 'otros', 'cuenta_capital'];
    const parts = ids.map((id) => map(`cf.${id}`));
    // Diferencias de redondeo de la fuente (máximo observado: 0,8 millones en dic-2022).
    for (const [p, v] of map('resultado.capital_financiera')) if (v !== null) expect(Math.abs(sumAt(parts, p) - v), p).toBeLessThan(1);
  });
});
