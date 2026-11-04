import type { Metadata } from 'next';
import { ACTIVIDAD_NO_DISPONIBLE, SERIES } from '@/core/registry';
import { ChartPanel } from '@/web/components/ChartPanel';
import { PageIntro, Unavailable } from '@/web/components/PageIntro';
import { SnapshotPanel } from '@/web/components/SnapshotPanel';
import { StoreProblem } from '@/web/components/StateMessages';
import { familyPool, getClientSeriesList, getStoreState, poolWithVariants } from '@/web/server/store';

// Sitio estático: se genera con los datos del store al momento del build (npm run build).
export const dynamic = 'force-static';
export const metadata: Metadata = { title: 'Actividad' };

export default function ActividadPage() {
  const state = getStoreState();
  if (state.status !== 'ok') return <StoreProblem state={state} />;
  const synthetic = state.dataMode === 'synthetic';

  const emae = poolWithVariants(['actividad.emae.total.orig']);
  const sectorIds = SERIES.filter((s) => s.family === 'emae_sectores').map((s) => s.id);
  const sectors = familyPool('emae_sectores');
  const sectorsWithTotal = [...getClientSeriesList(['actividad.emae.total.orig']), ...sectors];
  const ipi = poolWithVariants(['actividad.ipi_manuf.total.orig']);
  // Bloques del IPI: se eligen por la serie original; el ajuste se cambia con el toggle.
  const bloqueIds = SERIES.filter((s) => s.family === 'ipi_manuf_bloques' && s.seasonalAdjustment === 'original').map((s) => s.id);
  const bloques = familyPool('ipi_manuf_bloques');
  const bloquesOrig = [...getClientSeriesList(['actividad.ipi_manuf.total.orig']), ...getClientSeriesList(bloqueIds)];

  return (
    <>
      <PageIntro title="Actividad">
        <p>
          Estimador mensual de actividad económica (EMAE) e índice de producción industrial manufacturero (IPI). Variaciones mensuales solo sobre series
          desestacionalizadas o tendencia-ciclo; la serie original se compara en forma interanual.
        </p>
      </PageIntro>

      <ChartPanel
        title="EMAE — Nivel general"
        description="Índice base 2004=100. Elegí el ajuste estacional: la serie desestacionalizada se re-estima completa con cada publicación."
        pool={emae}
        options={['actividad.emae.total.orig']}
        defaultSelected={['actividad.emae.total.orig']}
        defaultAdjustment="desestacionalizada"
        defaultTransform="level"
        fallbackTransforms={['pct_yoy', 'level']}
        synthetic={synthetic}
      />

      <SnapshotPanel
        title="EMAE por sectores — último mes"
        description="Variación de cada sector (serie original) en el mes elegido, con el nivel general como referencia."
        series={sectorsWithTotal}
        referenceId="actividad.emae.total.orig"
        transforms={['pct_yoy', 'ytd_avg_pct_yoy']}
        defaultTransform="pct_yoy"
        synthetic={synthetic}
      />

      <ChartPanel
        title="EMAE por sectores — evolución"
        description="Los sectores se publican solo como serie original: se comparan interanualmente."
        pool={sectors}
        options={sectorIds}
        defaultSelected={[
          'actividad.emae_sector.industria.orig',
          'actividad.emae_sector.construccion.orig',
          'actividad.emae_sector.comercio.orig',
          'actividad.emae_sector.agro.orig',
        ]}
        defaultTransform="pct_yoy"
        defaultRange="24m"
        pickerLabel="Sectores"
        synthetic={synthetic}
      />

      <ChartPanel
        title="IPI manufacturero — Nivel general"
        description="Índice base 2004=100."
        pool={ipi}
        options={['actividad.ipi_manuf.total.orig']}
        defaultSelected={['actividad.ipi_manuf.total.orig']}
        defaultAdjustment="desestacionalizada"
        defaultTransform="level"
        synthetic={synthetic}
      />

      {bloqueIds.length > 0 && (
        <>
          <SnapshotPanel
            title="IPI manufacturero por bloques — último mes"
            description="Variación de cada bloque (serie original) en el mes elegido, con el nivel general como referencia."
            series={bloquesOrig}
            referenceId="actividad.ipi_manuf.total.orig"
            transforms={['pct_yoy', 'ytd_avg_pct_yoy']}
            defaultTransform="pct_yoy"
            synthetic={synthetic}
          />
          <ChartPanel
            title="IPI manufacturero por bloques — evolución"
            description="Índice base 2004=100 por bloque industrial. La variación mensual solo se habilita con la serie desestacionalizada."
            pool={bloques}
            options={bloqueIds}
            defaultSelected={bloqueIds.filter((id) => /alimentos|automotores|quimicos|metalicas_basicas/.test(id))}
            defaultAdjustment="original"
            defaultTransform="pct_yoy"
            defaultRange="24m"
            pickerLabel="Bloques"
            synthetic={synthetic}
          />
        </>
      )}

      <Unavailable items={ACTIVIDAD_NO_DISPONIBLE} />
    </>
  );
}
