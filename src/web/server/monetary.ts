import { cache } from 'react';
import { readMonetaryStore } from '@/monetary/store';
import { deriveMonetarySeries } from '@/monetary/analytics';
import { buildAggregatesGdp } from '@/web/lib/aggregatesGdp';
import { getClientSeries } from './store';

/** Fuente independiente: nunca llama Sheets ni servicios remotos durante el render. */
export const getMonetaryPageData = cache(async () => {
  const store = readMonetaryStore();
  const ipc = getClientSeries('precios.ipc.ng.nacional')?.observations.map(o => ({period:o.period,value:o.value})) ?? [];
  const series = deriveMonetarySeries(store.series);
  const gdp = getClientSeries('actividad.pib.corriente')?.observations ?? [];
  const asOf = (store.updatedAt ?? new Date().toISOString()).slice(0, 10);
  const aggregatesGdp = buildAggregatesGdp(series, gdp, asOf);
  return {...store, series, ipc, aggregatesGdp};
});
