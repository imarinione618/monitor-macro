/**
 * Catálogo y datos del Laboratorio — SOLO SERVIDOR (lee los stores con node:fs al generar el sitio).
 * Reúne todas las variables del monitor: registro INDEC/datos.gob.ar/IDECBA (data/store), BCRA y
 * caución (data/monetary). Combustibles queda fuera del Laboratorio (solo sección Precios).
 */
import { cache } from 'react';
import { SERIES } from '@/core/registry';
import { TOPIC_LABELS, type Measure, type SeriesDef } from '@/core/types';
import { deriveMonetarySeries } from '@/monetary/analytics';
import { readMonetaryStore } from '@/monetary/store';
import { selectableMonetarySeries } from '@/web/lib/monetarySelection';
import type { LabNature, LabSeriesData, LabSeriesMeta } from '@/web/lib/labTypes';
import { getClientSeries } from './store';

const NATURE: Record<Measure, LabNature> = {
  index: 'index', rate: 'rate', flow: 'flow', balance: 'balance', price_level: 'index',
  published_change: 'rate', weight: 'rate', incidence: 'rate',
};

const ADJ: Record<string, string> = { desestacionalizada: 'desestacionalizada', 'tendencia-ciclo': 'tendencia-ciclo' };

function coreEntries(): { meta: LabSeriesMeta; data: LabSeriesData }[] {
  return SERIES.flatMap((def: SeriesDef) => {
    const cs = getClientSeries(def.id);
    if (!cs || cs.missing) return [];
    const points = cs.observations.map((o) => [o.period, o.value] as [string, number | null]);
    const org = [...new Set(cs.sources.map((s) => s.org))].join(' y ') || 'INDEC';
    const adj = ADJ[def.seasonalAdjustment];
    return [{
      meta: {
        id: def.id, name: def.name, shortName: def.shortName, group: TOPIC_LABELS[def.topic], unit: def.unit, frequency: def.frequency,
        nature: NATURE[def.measure], org, start: cs.firstPeriod, end: cs.lastPeriod,
        note: [adj ? `Serie ${adj}` : '', def.geography !== 'Total país' ? def.geography : ''].filter(Boolean).join(' · ') || undefined,
      },
      data: { id: def.id, points },
    }];
  });
}

function monetaryEntries(): { meta: LabSeriesMeta; data: LabSeriesData }[] {
  const store = readMonetaryStore();
  const series = selectableMonetarySeries(deriveMonetarySeries(store.series));
  return series.flatMap((s) => {
    const valid = s.observations.filter((o) => o.value !== null);
    if (!valid.length) return [];
    const monthly = s.def.frequency === 'M';
    const points = s.observations.map((o) => [monthly ? o.date.slice(0, 7) : o.date, o.value] as [string, number | null]);
    const a3 = s.def.provider === 'A3';
    const nature: LabNature = s.def.kind === 'rate' ? 'rate' : 'stock';
    return [{
      meta: {
        id: s.def.id, name: s.def.name, shortName: s.def.shortName, group: a3 ? 'Mercado (A3)' : 'Monetario (BCRA)', unit: s.def.unit,
        frequency: monthly ? 'M' : 'D', nature, org: a3 ? 'A3 Mercados' : 'BCRA', start: points[0]?.[0] ?? null, end: points.at(-1)?.[0] ?? null,
        note: [s.def.currency, s.def.sector === 'private' ? 'sector privado' : s.def.sector === 'public' ? 'sector público' : '', monthly && s.def.monthlyConvention ? (s.def.monthlyConvention === 'close' ? 'cierre mensual' : 'promedio mensual') : ''].filter(Boolean).join(' · ') || undefined,
      },
      data: { id: s.def.id, points },
    }];
  });
}

const all = cache(() => {
  // Combustibles no se incluye en el Laboratorio (decisión del usuario, 2026-11-06).
  const entries = [...coreEntries(), ...monetaryEntries()];
  const seen = new Set<string>();
  return entries.filter((e) => (seen.has(e.meta.id) ? false : (seen.add(e.meta.id), true)));
});

export function labCatalog(): LabSeriesMeta[] {
  return all().map((e) => e.meta);
}

export function labData(id: string): LabSeriesData | null {
  return all().find((e) => e.meta.id === id)?.data ?? null;
}
