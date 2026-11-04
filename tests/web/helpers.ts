import { periodRange } from '@/core/periods';
import { getSeries } from '@/core/registry';
import type { Observation, Period } from '@/core/types';
import type { ClientSeries } from '@/web/lib/types';

/** Serie de prueba (determinista) con la definición real del registro. */
export function fakeSeries(id: string, from: Period, to: Period, f: (i: number) => number | null, extra: Partial<ClientSeries> = {}): ClientSeries {
  const def = getSeries(id);
  const observations: Observation[] = periodRange(from, to).map((p, i) => ({ period: p, value: f(i) }));
  return {
    def,
    observations,
    missing: false,
    firstPeriod: from,
    lastPeriod: to,
    retrievedAt: '2026-11-04T13:02:59.007Z',
    stale: false,
    synthetic: true,
    sources: [{ title: 'Dataset de prueba', methodologyUrl: 'https://www.indec.gob.ar/' }],
    ...extra,
  };
}
