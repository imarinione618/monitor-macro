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
  const idsOfFamily = (family: string) => SERIES.filter((s) => s.family === family).map((s) => s.id);
  const pib = poolWithVariants(['actividad.pib.total.orig']);
  const pibNominal = getClientSeriesList(idsOfFamily('pib_nominal'));
  const oydIds = idsOfFamily('oyd');
  const oyd = familyPool('oyd');
  const oydCorriente = getClientSeriesList(idsOfFamily('oyd_corriente'));
  const vabIds = idsOfFamily('vab').filter((id) => !/\.(bienes|servicios|vab_total|impuestos_netos)$/.test(id));
  const vab = getClientSeriesList(idsOfFamily('vab'));
  const vabWithTotal = [...getClientSeriesList(['actividad.vab.vab_total']), ...getClientSeriesList(vabIds)];
  const consumoIds = SERIES.filter((s) => s.family === 'consumo' && s.seasonalAdjustment === 'original').map((s) => s.id);
  const consumo = familyPool('consumo');
  const consumoNominal = getClientSeriesList([...idsOfFamily('consumo_nominal'), ...idsOfFamily('consumo_constante')]);
  const hasPib = pib.some((s) => !s.missing);
  const restaurantes = getClientSeriesList(['actividad.caba.restaurantes']);

  return (
    <>
      <PageIntro title="Actividad">
        <p>
          Estimador mensual de actividad económica (EMAE) e índices de producción industrial manufacturero y minero (IPI). Variaciones mensuales solo sobre series
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

      {hasPib && (
        <>
          <ChartPanel
            title="PIB a precios constantes"
            description="Millones de pesos de 2004, nivel trimestral anualizado (INDEC). La variación t/t solo se habilita con la serie desestacionalizada."
            pool={pib}
            options={['actividad.pib.total.orig']}
            defaultSelected={['actividad.pib.total.orig']}
            defaultAdjustment="desestacionalizada"
            defaultTransform="pct_prev"
            fallbackTransforms={['pct_yoy', 'level']}
            defaultRange="5y"
            kind="bar"
            synthetic={synthetic}
          />
          <ChartPanel
            title="PIB a precios corrientes y deflactor implícito"
            description="PIB nominal (millones de pesos corrientes, anualizado) e índice de precios implícitos (2004=100). La variación interanual del deflactor mide la inflación de la economía."
            pool={pibNominal}
            options={pibNominal.map((s) => s.def.id)}
            defaultSelected={['actividad.pib.deflactor']}
            defaultTransform="pct_yoy"
            defaultRange="5y"
            synthetic={synthetic}
          />
          <ChartPanel
            title="Oferta y demanda globales"
            description="Componentes a precios de 2004 (anualizados). Variación interanual de la serie original o t/t desestacionalizada donde existe."
            pool={oyd}
            options={oydIds}
            defaultSelected={['actividad.oyd.consumo_privado.orig', 'actividad.oyd.consumo_publico.orig', 'actividad.oyd.inversion.orig', 'actividad.oyd.exportaciones.orig', 'actividad.oyd.importaciones.orig']}
            defaultAdjustment="original"
            defaultTransform="pct_yoy"
            defaultRange="5y"
            pickerLabel="Componentes"
            synthetic={synthetic}
          />
          <ChartPanel
            title="Oferta y demanda globales a precios corrientes"
            description="Millones de pesos corrientes (anualizados). Valores nominales: no son volumen."
            pool={oydCorriente}
            options={oydCorriente.map((s) => s.def.id)}
            defaultSelected={['actividad.oyd_corriente.consumo_privado', 'actividad.oyd_corriente.inversion']}
            defaultTransform="pct_yoy"
            defaultRange="5y"
            pickerLabel="Componentes"
            synthetic={synthetic}
          />
          <SnapshotPanel
            title="Valor agregado por sector — último trimestre"
            description="Variación interanual de cada sector (letras CIIU, precios de 2004), con el VAB total como referencia."
            series={vabWithTotal}
            referenceId="actividad.vab.vab_total"
            transforms={['pct_yoy', 'ytd_avg_pct_yoy']}
            defaultTransform="pct_yoy"
            synthetic={synthetic}
          />
          <ChartPanel
            title="Valor agregado por sector — evolución"
            description="Precios de 2004, nivel trimestral anualizado; serie original (comparar interanualmente)."
            pool={vab}
            options={idsOfFamily('vab')}
            defaultSelected={['actividad.vab.agro', 'actividad.vab.industria', 'actividad.vab.construccion', 'actividad.vab.comercio']}
            defaultTransform="pct_yoy"
            defaultRange="5y"
            pickerLabel="Sectores"
            synthetic={synthetic}
          />
        </>
      )}

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

      <ChartPanel
        title="IPI minero — Nivel general"
        description="Índice base 2016=100. Serie original, desestacionalizada y tendencia-ciclo."
        pool={poolWithVariants(['actividad.ipi_minero.total.orig'])}
        options={['actividad.ipi_minero.total.orig']}
        defaultSelected={['actividad.ipi_minero.total.orig']}
        defaultAdjustment="desestacionalizada"
        defaultTransform="level"
        synthetic={synthetic}
      />

      {consumo.some((s) => !s.missing) && (
        <>
          <ChartPanel
            title="Consumo: supermercados, mayoristas y shoppings"
            description="Índices de ventas a precios constantes (2017=100), encuestas del INDEC. Variación mensual solo con la serie desestacionalizada o tendencia-ciclo."
            pool={consumo}
            options={consumoIds}
            defaultSelected={consumoIds}
            defaultAdjustment="original"
            defaultTransform="pct_yoy"
            defaultRange="24m"
            pickerLabel="Canales"
            synthetic={synthetic}
          />
          <ChartPanel
            title="Ventas en millones de pesos"
            description="Ventas a precios corrientes (nominales, no son volumen) y a precios constantes de 2017."
            pool={consumoNominal}
            options={consumoNominal.map((s) => s.def.id)}
            defaultSelected={consumoNominal.filter((s) => s.def.family === 'consumo_nominal').map((s) => s.def.id)}
            defaultTransform="pct_yoy"
            defaultRange="24m"
            pickerLabel="Series"
            synthetic={synthetic}
          />
        </>
      )}

      {restaurantes.some((x) => !x.missing) && (
        <ChartPanel
          title="Restaurantes en la Ciudad de Buenos Aires"
          description="Índice de volumen físico (cubiertos vendidos) en restaurantes tradicionales de CABA, IDECBA, base marzo 2015=100. Sin desestacionalizar: comparar en forma interanual."
          pool={restaurantes}
          options={['actividad.caba.restaurantes']}
          defaultSelected={['actividad.caba.restaurantes']}
          defaultTransform="pct_yoy"
          fallbackTransforms={['level']}
          defaultRange="5y"
          synthetic={synthetic}
        />
      )}

      <Unavailable items={ACTIVIDAD_NO_DISPONIBLE} />
    </>
  );
}
