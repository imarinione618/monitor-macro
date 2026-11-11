/**
 * Invariantes del store REAL (data/store): cada serie del registro existe, está
 * ordenada, sin duplicados ni huecos, con la frecuencia de su definición, sin marca
 * sintética y con valores finitos. Se saltea si no hay store real.
 */
import { describe, expect, it } from 'vitest';
import { comparePeriods, frequencyOf, shiftPeriod } from '../../src/core/periods';
import { SERIES } from '../../src/core/registry';
import { listStoredSeries } from '../../src/core/store';
import { load, REAL_STORE_DIR, requireRealStore } from './helpers';

const st = requireRealStore('invariantes del store real');

describe.skipIf(!st.ok)('store real — invariantes', () => {
  it('el manifest declara datos reales', () => {
    expect(st.manifest!.dataMode).toBe('real');
    // Una corrida fallida NO frena el build: el store conserva el último dato válido
    // (marcado stale) y el dashboard informa la fecha por fuente. El aviso en GitHub lo
    // emite scripts/check-freshness.ts en el workflow de Pages.
    if (st.manifest!.lastRun && !st.manifest!.lastRun.ok) {
      console.warn(`Aviso: la última corrida de ingesta (${st.manifest!.lastRun.runId}) terminó con errores; se usan datos conservados.`);
    }
  });

  it('cada serie del registro tiene archivo y no hay archivos huérfanos', () => {
    const stored = new Set(listStoredSeries(REAL_STORE_DIR));
    const missing = SERIES.filter((s) => !stored.has(s.id)).map((s) => s.id);
    const orphan = [...stored].filter((id) => !SERIES.some((s) => s.id === id));
    expect(missing).toEqual([]);
    expect(orphan).toEqual([]);
  });

  for (const def of SERIES) {
    describe(def.id, () => {
      it('orden ascendente, sin duplicados ni huecos, frecuencia coherente con la definición', () => {
        const d = load(def.id);
        expect(d.id).toBe(def.id);
        expect(d.observations.length).toBeGreaterThan(0);
        const errors: string[] = [];
        let prev: string | null = null;
        for (const o of d.observations) {
          if (frequencyOf(o.period) !== def.frequency) errors.push(`frecuencia ${o.period} ≠ ${def.frequency}`);
          if (prev !== null) {
            const c = comparePeriods(o.period, prev);
            if (c === 0) errors.push(`duplicado ${o.period}`);
            else if (c < 0) errors.push(`desorden ${prev} → ${o.period}`);
            // Los nulos intermedios se guardan como filas con value null: no debe haber saltos de calendario.
            else if (shiftPeriod(prev, 1) !== o.period) errors.push(`hueco ${prev} → ${o.period}`);
          }
          prev = o.period;
        }
        expect(errors).toEqual([]);
      });

      it('sin marca sintética; valores no nulos finitos; nulos con signo; meta coherente', () => {
        const d = load(def.id);
        expect(d.meta.synthetic, 'meta.synthetic no debe existir en el store real').toBeUndefined();
        const bad = d.observations.filter((o) => o.value !== null && !Number.isFinite(o.value));
        expect(bad).toEqual([]);
        // Faltante = null con su signo convencional; nunca un null "mudo".
        const mute = d.observations.filter((o) => o.value === null && !(o.flags && o.flags.length));
        expect(mute).toEqual([]);
        expect(d.meta.firstPeriod).toBe(d.observations[0]!.period);
        expect(d.meta.lastPeriod).toBe(d.observations.at(-1)!.period);
        expect(Number.isNaN(Date.parse(d.meta.retrievedAt))).toBe(false);
        const m = st.manifest!.series[def.id];
        expect(m, 'serie ausente del manifest').toBeDefined();
        expect(m!.count).toBe(d.observations.length);
        expect(m!.lastPeriod).toBe(d.meta.lastPeriod);
      });

      it('rango económico plausible según la naturaleza de la serie', () => {
        const vals = load(def.id).observations.map((o) => o.value).filter((v): v is number => v !== null);
        // Partidas fiscales (IMIG): la fuente publica ceros (sin ejecución en el mes) y netos negativos.
        if (def.topic === 'fiscal') {
          expect(vals.every((v) => Number.isFinite(v)), 'valores fiscales finitos').toBe(true);
        } else if (def.measure === 'index' || def.measure === 'flow' || def.measure === 'price_level') {
          expect(vals.filter((v) => v <= 0), 'índices, flujos y canastas deben ser > 0 (sin ceros espurios)').toEqual([]);
        }
        if (def.measure === 'rate') expect(vals.filter((v) => v < 0 || v > 100)).toEqual([]);
      });
    });
  }

  it('las bases declaradas se verifican en los datos', () => {
    const at = (id: string, p: string) => load(id).observations.find((o) => o.period === p)?.value;
    expect(at('precios.ipc.ng.nacional', '2016-12')).toBeCloseTo(100, 6); // dic-2016=100
    expect(at('laboral.salarios.total', '2016-10')).toBeCloseTo(100, 6); // oct-2016=100
    expect(at('precios.sipm.ipim.ng', '2015-12')).toBeCloseTo(100, 6); // dic-2015=100
    expect(at('precios.icc.ng', '2022-01')).toBeCloseTo(100, 6); // ene-22=100 (según la API)
    const emae2004 = load('actividad.emae.total.orig').observations.filter((o) => o.period.startsWith('2004-'));
    expect(emae2004).toHaveLength(12);
    expect(emae2004.reduce((a, o) => a + o.value!, 0) / 12).toBeCloseTo(100, 6); // promedio 2004=100
  });

  it('salario real: base dic-2016=100 y rango plausible (50–130)', () => {
    for (const id of SERIES.filter((s) => s.family === 'salarios_reales').map((s) => s.id)) {
      const obs = load(id).observations;
      expect(obs[0]!.period).toBe('2016-12');
      expect(obs[0]!.value).toBeCloseTo(100, 9);
      const vals = obs.map((o) => o.value).filter((v): v is number => v !== null);
      expect(Math.min(...vals)).toBeGreaterThan(50);
      expect(Math.max(...vals)).toBeLessThan(130);
    }
  });

  it('comercio exterior en millones de USD (escala 1e-6): totales mensuales recientes entre 1.000 y 20.000', () => {
    for (const id of ['comex.expo.total', 'comex.impo.total']) {
      const recent = load(id).observations.filter((o) => o.period >= '2010-01');
      expect(recent.length).toBeGreaterThan(100);
      for (const o of recent) {
        expect(o.value!).toBeGreaterThan(1000);
        expect(o.value!).toBeLessThan(20000);
      }
    }
  });
});
