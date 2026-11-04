import { cache } from 'react';
import { readMonetaryStore } from '@/monetary/store';
import { deriveMonetarySeries } from '@/monetary/analytics';
import { getClientSeries } from './store';

/** Fuente independiente: nunca llama Sheets ni servicios remotos durante el render. */
export const getMonetaryPageData = cache(async () => {
  const store = readMonetaryStore();
  const ipc = getClientSeries('precios.ipc.ng.nacional')?.observations.map(o => ({period:o.period,value:o.value})) ?? [];
  return {...store, series:deriveMonetarySeries(store.series), ipc};
});
