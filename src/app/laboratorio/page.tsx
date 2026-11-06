import type { Metadata } from 'next';
import { LabApp } from '@/web/components/LabApp';
import { PageIntro } from '@/web/components/PageIntro';
import { labCatalog } from '@/web/server/lab';
import './laboratorio.css';

export const dynamic = 'force-static';
export const metadata: Metadata = { title: 'Laboratorio' };

export default function LaboratorioPage() {
  const catalog = labCatalog();
  const basePath = (process.env.SITE_BASE_PATH || '').replace(/\/+$/, '');
  return (
    <>
      <PageIntro title="Laboratorio">
        <p>
          Armá tu propio gráfico con todas las variables del monitor: INDEC, Hacienda, IDECBA, BCRA, A3 Mercados y Secretaría de Energía. Convertí frecuencias (promedio, último
          dato o suma), deflactá por IPC nacional, aplicá variaciones, logaritmos y escalas, usá dos ejes y construí ratios entre series. La selección se guarda en este navegador.
        </p>
      </PageIntro>
      <LabApp catalog={catalog} basePath={basePath} />
    </>
  );
}
