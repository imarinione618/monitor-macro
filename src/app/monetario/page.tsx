import type { Metadata } from 'next';
import { MonetaryDashboard } from '@/web/components/MonetaryDashboard';
import { PageIntro } from '@/web/components/PageIntro';
import { getMonetaryPageData } from '@/web/server/monetary';
import './monetary.css';

export const dynamic = 'force-static';
export const metadata: Metadata = { title: 'Monetario' };

export default async function MonetarioPage() {
  const data = await getMonetaryPageData();
  return <><PageIntro title="Monetario"><p>Tasas, depósitos, préstamos y agregados descargados directamente de la API BCRA v4. Saldos mensuales, fechas propias por serie y valores reales con el IPC nacional del INDEC. Las construcciones desde componentes oficiales se identifican como cálculos propios.</p></PageIntro><MonetaryDashboard {...data} /></>;
}
