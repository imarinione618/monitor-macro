import type { Metadata } from 'next';
import { LABORAL_COMPLEMENTARIAS, SERIES } from '@/core/registry';
import { ChartPanel } from '@/web/components/ChartPanel';
import { PageIntro, Unavailable } from '@/web/components/PageIntro';
import { StoreProblem } from '@/web/components/StateMessages';
import { familyPool, getStoreState } from '@/web/server/store';

// Sitio estático: se genera con los datos del store al momento del build (npm run build).
export const dynamic = 'force-static';
export const metadata: Metadata = { title: 'Mercado laboral' };

const EPH_CALLOUT = 'EPH: 31 aglomerados urbanos — no es total nacional (no incluye población rural ni localidades no relevadas).';

const ids = (family: string) => SERIES.filter((s) => s.family === family).map((s) => s.id);

export default function LaboralPage() {
  const state = getStoreState();
  if (state.status !== 'ok') return <StoreProblem state={state} />;
  const synthetic = state.dataMode === 'synthetic';
  const salarios = familyPool('salarios');
  const reales = familyPool('salarios_reales');
  const eph = familyPool('eph_tasas');
  const pobreza = familyPool('pobreza');

  return (
    <>
      <PageIntro title="Mercado laboral">
        <p>Índice de salarios (nominal y real), tasas de la Encuesta Permanente de Hogares (trimestral) y pobreza (semestral).</p>
      </PageIntro>

      <ChartPanel
        title="Salarios nominales por sector"
        description="Índice de salarios, base oct-2016=100. El valor del sector privado no registrado refleja salarios de unos 5 meses antes (rezago de la fuente)."
        pool={salarios}
        options={ids('salarios')}
        defaultSelected={['laboral.salarios.privado_registrado', 'laboral.salarios.publico', 'laboral.salarios.no_registrado']}
        defaultTransform="pct_yoy"
        pickerLabel="Sectores"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Salarios reales"
        description="Índice de salarios deflactado por el IPC nacional, base dic-2016=100."
        callout="Cálculo propio: índice de salarios / IPC nacional del mismo mes, ambos sin desestacionalizar. No es una serie publicada por el INDEC."
        pool={reales}
        options={ids('salarios_reales')}
        defaultSelected={['laboral.salarios.registrado_real', 'laboral.salarios.privado_registrado_real', 'laboral.salarios.publico_real']}
        defaultTransform="level"
        pickerLabel="Sectores"
        synthetic={synthetic}
      />

      <ChartPanel
        title="EPH — Desocupación y subocupación"
        description="Tasas trimestrales en % de la población económicamente activa. Comparar contra el mismo trimestre del año anterior."
        callout={EPH_CALLOUT}
        pool={eph}
        options={ids('eph_tasas')}
        defaultSelected={['laboral.eph.desocupacion', 'laboral.eph.subocupacion']}
        defaultTransform="level"
        fallbackTransforms={['level']}
        defaultRange="all"
        pickerLabel="Tasas"
        synthetic={synthetic}
      />

      <ChartPanel
        title="EPH — Actividad y empleo"
        description="Tasas trimestrales en % de la población total."
        callout={EPH_CALLOUT}
        pool={eph}
        options={ids('eph_tasas')}
        defaultSelected={['laboral.eph.actividad', 'laboral.eph.empleo']}
        defaultTransform="level"
        fallbackTransforms={['level']}
        defaultRange="all"
        pickerLabel="Tasas"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Pobreza e indigencia"
        description="Datos semestrales, % de personas u hogares."
        callout={EPH_CALLOUT}
        pool={pobreza}
        options={ids('pobreza')}
        defaultSelected={['laboral.pobreza.pobreza_personas', 'laboral.pobreza.indigencia_personas']}
        defaultTransform="level"
        fallbackTransforms={['level']}
        defaultRange="all"
        pickerLabel="Indicadores"
        synthetic={synthetic}
      />

      <Unavailable
        title="Fuentes complementarias (fuera de la API del INDEC, no incluidas)"
        items={LABORAL_COMPLEMENTARIAS.map((c) => `${c.indicador} — ${c.fuente}. ${c.nota}`)}
      />
    </>
  );
}
