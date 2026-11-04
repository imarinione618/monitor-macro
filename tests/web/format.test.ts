import { describe, expect, it } from 'vitest';
import { decimalsForUnit, formatAxis, formatDateTimeAR, formatNumber, formatWithUnit, slugify } from '@/web/lib/format';

describe('formato es-AR', () => {
  it('usa coma decimal y punto de miles', () => {
    expect(formatNumber(1234.567, 1)).toBe('1.234,6');
    expect(formatNumber(1234567.891, 2)).toBe('1.234.567,89');
    expect(formatNumber(0.5, 2)).toBe('0,50');
  });

  it('faltante → s/d (nunca 0)', () => {
    expect(formatNumber(null)).toBe('s/d');
    expect(formatNumber(undefined)).toBe('s/d');
    expect(formatNumber(Number.NaN)).toBe('s/d');
    expect(formatWithUnit(null, '%')).toBe('s/d');
  });

  it('signo explícito en variaciones, sin "-0"', () => {
    expect(formatNumber(2.345, 1, { signed: true })).toBe('+2,3');
    expect(formatNumber(-2.345, 1, { signed: true })).toBe('-2,3');
    expect(formatNumber(-0.01, 1)).toBe('0,0');
    expect(formatNumber(0, 1, { signed: true })).toBe('0,0');
  });

  it('unidades: %, p.p., millones de USD, pesos, índices', () => {
    expect(formatWithUnit(4.2149, '%')).toBe('4,2 %');
    expect(formatWithUnit(-0.35, 'p.p.', { signed: true })).toBe('-0,4 p.p.');
    expect(formatWithUnit(7234.6, 'Millones de USD')).toBe('7.235 M USD');
    expect(formatWithUnit(345678.9, 'Pesos corrientes por mes')).toBe('$ 345.679');
    expect(formatWithUnit(152.345, 'Índice base 2004=100')).toBe('152,3');
    expect(decimalsForUnit('%')).toBe(1);
  });

  it('ejes compactos', () => {
    expect(formatAxis(1500)).toBe('1.500');
    expect(formatAxis(2.5)).toBe('2,5');
    expect(formatAxis(110000)).toBe('110.000');
    expect(formatAxis(1_500_000)).toBe('1.500.000');
    expect(formatAxis(15_000_000)).toBe('15,0 M');
  });

  it('fecha y hora de Buenos Aires (UTC−3)', () => {
    expect(formatDateTimeAR('2026-11-04T13:02:59.007Z')).toBe('04/11/2026 10:02');
    expect(formatDateTimeAR(null)).toBe('s/d');
  });

  it('slug para archivos', () => {
    expect(slugify('IPC — Nivel general por región')).toBe('ipc-nivel-general-por-region');
  });
});
