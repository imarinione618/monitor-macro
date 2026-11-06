import type { Metadata } from 'next';
import { SERIES } from '@/core/registry';
import { ChartPanel } from '@/web/components/ChartPanel';
import { PageIntro } from '@/web/components/PageIntro';
import { SnapshotPanel } from '@/web/components/SnapshotPanel';
import { StoreProblem } from '@/web/components/StateMessages';
import { getClientSeriesList, getStoreState } from '@/web/server/store';
import { readFuelStore } from '@/combustibles/store';
import { FuelPanel } from '@/web/components/FuelPanel';
import { buildIpcContributions, contributionId, IPC_CONTRIBUTIONS } from '@/web/lib/ipcContributions';

// Sitio estático: se genera con los datos del store al momento del build (npm run build).
export const dynamic = 'force-static';
export const metadata: Metadata = { title: 'Precios' };

/** Series de una familia, excluyendo variaciones publicadas (no se re-transforman). */
const ids = (family: string) => SERIES.filter((s) => s.family === family && s.measure !== 'published_change').map((s) => s.id);
const NG = 'precios.ipc.ng.nacional';

export default function PreciosPage() {
  const state = getStoreState();
  if (state.status !== 'ok') return <StoreProblem state={state} />;
  const synthetic = state.dataMode === 'synthetic';

  const regiones = ids('ipc_nivel_general');
  const categorias = [NG, ...ids('ipc_categorias')];
  const divisiones = [NG, ...ids('ipc_divisiones')];
  const contributions = buildIpcContributions(getClientSeriesList(categorias));
  const contributionIds = IPC_CONTRIBUTIONS.map(({ key }) => contributionId(key));

  const familyIds = (f: string) => SERIES.filter((x) => x.family === f).map((x) => x.id);
  const ipcbaMain = getClientSeriesList(['precios.ipcba.nivel_general', ...familyIds('ipcba_bs')]);
  const ipcbaCat = getClientSeriesList(['precios.ipcba.nivel_general', ...familyIds('ipcba_categorias')]);
  const ipcbaDivs = getClientSeriesList(['precios.ipcba.nivel_general', ...familyIds('ipcba_divisiones')]);

  const fuel = readFuelStore().series;

  return (
    <>
      <PageIntro title="Precios">
        <p>
          IPC (base dic-2016=100), precios mayoristas (SIPM), costo de la construcción (ICC, GBA) y canastas básicas en pesos. La variación mensual de la serie
          original es la medida oficial de inflación.
        </p>
      </PageIntro>

      <ChartPanel
        title="IPC — Nivel general por región"
        description="Elegí una o varias regiones para comparar."
        pool={getClientSeriesList(regiones)}
        options={regiones}
        defaultSelected={[NG]}
        defaultTransform="pct_prev"
        defaultRange="24m"
        kind="line"
        pickerLabel="Región"
        synthetic={synthetic}
      />

      <ChartPanel
        title="IPC — Núcleo, regulados y estacionales"
        description="Categorías del IPC nacional, con el nivel general como referencia."
        pool={getClientSeriesList(categorias)}
        options={categorias}
        defaultSelected={[NG, 'precios.ipc.cat.nucleo.nacional', 'precios.ipc.cat.regulados.nacional', 'precios.ipc.cat.estacionales.nacional']}
        fixedColorSlots={{
          [NG]: 3,
          'precios.ipc.cat.nucleo.nacional': 1,
          'precios.ipc.cat.regulados.nacional': 0,
          'precios.ipc.cat.estacionales.nacional': 2,
          'precios.ipc.cat.bienes.nacional': 4,
          'precios.ipc.cat.servicios.nacional': 5,
        }}
        defaultTransform="pct_prev"
        defaultRange="24m"
        pickerLabel="Categorías"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Incidencia en la inflación general por categoría"
        description="Contribución mensual estimada, en puntos porcentuales. Las barras apiladas muestran el aporte de núcleo, estacionales y regulados; los aportes negativos se ubican debajo de cero."
        pool={contributions}
        options={contributionIds}
        defaultSelected={contributionIds}
        fixedColorSlots={Object.fromEntries(IPC_CONTRIBUTIONS.map(({ key, colorSlot }) => [contributionId(key), colorSlot]))}
        defaultTransform="level"
        defaultRange="24m"
        kind="stacked"
        pickerLabel="Categorías"
        synthetic={synthetic}
      />

      <SnapshotPanel
        title="IPC — Divisiones en el mes"
        description="Variación por división (COICOP), total nacional, con el nivel general como referencia."
        series={getClientSeriesList(divisiones)}
        referenceId={NG}
        transforms={['pct_prev', 'pct_yoy', 'pct_ytd']}
        defaultTransform="pct_prev"
        synthetic={synthetic}
      />

      <ChartPanel
        title="IPC — Divisiones, evolución"
        pool={getClientSeriesList(divisiones)}
        options={divisiones}
        defaultSelected={[NG, 'precios.ipc.div.alimentos.nacional', 'precios.ipc.div.vivienda.nacional', 'precios.ipc.div.transporte.nacional']}
        defaultTransform="pct_yoy"
        defaultRange="24m"
        pickerLabel="Divisiones"
        synthetic={synthetic}
      />

      {ipcbaMain.some((x) => !x.missing) && (
        <>
          <ChartPanel
            title="Inflación CABA (IPCBA) — nivel general, bienes y servicios"
            description="Índice de Precios al Consumidor de la Ciudad de Buenos Aires (IDECBA), base 2021=100. Alcance CABA: no es comparable con el IPC nacional."
            pool={ipcbaMain}
            options={ipcbaMain.map((x) => x.def.id)}
            defaultSelected={['precios.ipcba.nivel_general', 'precios.ipcba.bienes', 'precios.ipcba.servicios']}
            defaultTransform="pct_prev"
            fallbackTransforms={['pct_yoy', 'level']}
            defaultRange="24m"
            synthetic={synthetic}
          />
          <ChartPanel
            title="Inflación CABA (IPCBA) — estacionales, regulados y resto"
            description="Categorías del IPCBA. «Resto IPCBA» no equivale exactamente al núcleo del INDEC."
            pool={ipcbaCat}
            options={ipcbaCat.map((x) => x.def.id)}
            defaultSelected={ipcbaCat.map((x) => x.def.id)}
            defaultTransform="pct_prev"
            fallbackTransforms={['pct_yoy', 'level']}
            defaultRange="24m"
            synthetic={synthetic}
          />
          <SnapshotPanel
            title="Inflación CABA (IPCBA) — divisiones en el mes"
            description="Variación de cada división (COICOP 2018) con el nivel general como referencia."
            series={ipcbaDivs}
            referenceId="precios.ipcba.nivel_general"
            transforms={['pct_prev', 'pct_yoy', 'pct_ytd']}
            defaultTransform="pct_prev"
            synthetic={synthetic}
          />
        </>
      )}

      <ChartPanel
        title="Precios mayoristas (SIPM)"
        description="IPIM, IPIB e IPP — nivel general, y aperturas del IPIM (nacionales, importados, primarios, manufacturados y energía)."
        pool={getClientSeriesList([...ids('mayoristas'), ...ids('mayoristas_aperturas')])}
        options={[...ids('mayoristas'), ...ids('mayoristas_aperturas')]}
        defaultSelected={['precios.sipm.ipim.ng', 'precios.sipm.ipib.ng', 'precios.sipm.ipp.ng']}
        defaultTransform="pct_prev"
        defaultRange="24m"
        pickerLabel="Índices"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Costo de la construcción (ICC, GBA)"
        description="Nivel general y capítulos. Cobertura: Gran Buenos Aires."
        pool={getClientSeriesList(ids('icc'))}
        options={ids('icc')}
        defaultSelected={['precios.icc.ng', 'precios.icc.materiales', 'precios.icc.mano_obra']}
        defaultTransform="pct_yoy"
        defaultRange="24m"
        pickerLabel="Capítulos"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Canastas básicas (GBA)"
        description="Valor mensual en pesos corrientes (no es un índice)."
        pool={getClientSeriesList(ids('canastas'))}
        options={ids('canastas')}
        defaultSelected={['precios.canastas.cba_adulto', 'precios.canastas.cbt_adulto']}
        defaultTransform="level"
        defaultRange="24m"
        pickerLabel="Canastas"
        synthetic={synthetic}
      />

      {fuel.length > 0 && <FuelPanel series={fuel} />}
    </>
  );
}
