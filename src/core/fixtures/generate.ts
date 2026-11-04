/**
 * GENERADOR DE DATOS SINTÉTICOS — SOLO PARA DESARROLLO Y PRUEBAS.
 *
 * Escribe un store completo en data/store-fixtures/ con dataMode='synthetic' y
 * meta.synthetic=true en cada serie. Los valores son inventados (paseos aleatorios
 * deterministas) y NO representan datos reales. El dashboard muestra un aviso
 * visible cuando DATA_MODE=fixtures.
 *
 * Uso: npm run fixtures:generate
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERIES, dependenciesOf, getSeries } from '../registry';
import { periodRange } from '../periods';
import { differenceSeries, ipcContribution, realIndex } from '../transforms';
import { emptyManifest, writeManifest, writeSeriesData } from '../store';
import type { Observation, Period, SeriesData, SeriesDef } from '../types';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const RANGE: Record<string, [Period, Period]> = {
  M: ['2016-12', '2026-08'],
  Q: ['2016-Q2', '2026-Q2'],
  S: ['2016-S2', '2026-S1'],
  A: ['2017', '2025'],
};

function synth(def: SeriesDef): Observation[] {
  const r = rng(hash(def.id));
  const [a, b] = RANGE[def.frequency]!;
  const periods = periodRange(a, b);
  let x = def.measure === 'rate' ? 8 + r() * 30 : def.measure === 'flow' ? 1500 + r() * 3000 : 100;
  return periods.map((p, i) => {
    if (def.measure === 'index' || def.measure === 'price_level') {
      const drift = def.topic === 'precios' || def.topic === 'laboral' ? 0.025 : 0.001;
      x = x * (1 + drift + (r() - 0.5) * 0.02);
    } else if (def.measure === 'rate') {
      x = Math.max(0.5, x + (r() - 0.5) * 1.2);
    } else if (def.measure === 'flow') {
      x = Math.max(10, x * (1 + (r() - 0.5) * 0.15));
    } else {
      x = (r() - 0.5) * 6;
    }
    // un faltante deliberado para ejercitar estados de "sin dato"
    const missing = i === 20 && def.priority === 2;
    return { period: p, value: missing ? null : x };
  });
}

export function generateFixtureStore(dir: string): void {
  const now = new Date().toISOString();
  const runId = `synthetic-${now}`;
  const manifest = emptyManifest('synthetic');
  const produced = new Map<string, Observation[]>();

  const order = [...SERIES].sort((x, y) => (x.source.kind === 'derived' ? 1 : 0) - (y.source.kind === 'derived' ? 1 : 0));
  for (const def of order) {
    let obs: Observation[];
    if (def.source.kind === 'derived') {
      const op = def.source.op;
      const deps = dependenciesOf(def).map((d) => produced.get(d) ?? synth(getSeries(d)));
      if (op.type === 'difference') obs = differenceSeries(deps[0]!, deps[1]!);
      else if (op.type === 'real_index') obs = realIndex(deps[0]!, deps[1]!, op.basePeriod);
      else if (op.type === 'ipc_contribution') obs = ipcContribution(deps[0]!, deps[1]!, op.weight);
      else obs = deps[0]!;
    } else obs = synth(def);
    produced.set(def.id, obs);
    const data: SeriesData = {
      id: def.id,
      observations: obs,
      meta: {
        firstPeriod: obs[0]?.period ?? null,
        lastPeriod: obs.at(-1)?.period ?? null,
        retrievedAt: now,
        runId,
        synthetic: true,
      },
    };
    writeSeriesData(data, dir);
    manifest.series[def.id] = {
      firstPeriod: data.meta.firstPeriod,
      lastPeriod: data.meta.lastPeriod,
      count: obs.length,
      retrievedAt: now,
      stale: false,
    };
  }
  manifest.lastRun = { runId, startedAt: now, finishedAt: now, ok: true, partial: false };
  writeManifest(manifest, dir);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const dir = path.resolve('data/store-fixtures');
  generateFixtureStore(dir);
  console.log(`Store SINTÉTICO generado en ${dir} (${SERIES.length} series). No son datos reales.`);
}
