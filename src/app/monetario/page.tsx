import type { Metadata } from 'next';
import { MonetaryDashboard } from '@/web/components/MonetaryDashboard';
import { PageIntro } from '@/web/components/PageIntro';
import { getMonetaryPageData } from '@/web/server/monetary';
import './monetary.css';

export const dynamic = 'force-static';
export const metadata: Metadata = { title: 'Monetario' };

export default async function MonetarioPage() {
  const data = await getMonetaryPageData();
  return <><PageIntro title="Monetario"><p>Tasas, depósitos, préstamos y agregados monetarios con datos oficiales del BCRA. Saldos mensuales, fechas propias por serie y valores reales con el IPC nacional del INDEC.</p></PageIntro><MonetaryDashboard {...data} /></>;
}
