import type { Metadata } from 'next';
import { formatPeriodLong } from '@/core/periods';
import { FISCAL_CUADRO, SERIES } from '@/core/registry';
import { ChartPanel } from '@/web/components/ChartPanel';
import { FiscalTable } from '@/web/components/FiscalTable';
import { PageIntro } from '@/web/components/PageIntro';
import { StoreProblem } from '@/web/components/StateMessages';
import { buildSourceLine } from '@/web/lib/meta';
import { getClientSeriesList, getStoreState, withRealVariants } from '@/web/server/store';

export const dynamic = 'force-static';
export const metadata: Metadata = { title: 'Fiscal' };

export default function FiscalPage() {
  const state = getStoreState();
  if (state.status !== 'ok') return <StoreProblem state={state} />;
  const synthetic = state.dataMode === 'synthetic';

  const visible = SERIES.filter((s) => s.topic === 'fiscal' && s.family !== 'fiscal_aux');
  const nominal = getClientSeriesList(visible.map((s) => s.id)).filter((s) => !s.missing);
  const { pool, realOf, basePeriod } = withRealVariants(nominal);
  const realLabel = basePeriod ? formatPeriodLong(basePeriod) : null;
  const idsOf = (families: string[]) => visible.filter((s) => families.includes(s.family)).map((s) => s.id);
  const source = buildSourceLine(nominal, 'level', ['INDEC']);
  const common = { pool, realOf, realLabel: realLabel ?? undefined, synthetic };

  if (!nominal.length)
    return (
      <>
        <PageIntro title="Fiscal"><p>Todavía no hay datos fiscales en el store. Ejecutá <code>npm run data:refresh</code>.</p></PageIntro>
      </>
    );

  return (
    <>
      <PageIntro title="Fiscal">
        <p>
          Sector Público Nacional no financiero, base caja, mensual (Secretaría de Hacienda, Informe Mensual de Ingresos y Gastos, metodología vigente). Valores en millones
          de pesos corrientes y a precios de {realLabel ?? 'hoy'} (deflactados por el IPC nacional del INDEC). Las variaciones de las partidas son interanuales; los resultados
          se comparan como diferencia en niveles a precios de hoy.
        </p>
      </PageIntro>

      <ChartPanel
        title="Resultado primario y financiero"
        description="Resultado mensual. Con valores reales, la diferencia interanual se expresa en millones de pesos de hoy."
        options={['fiscal.resultado.primario', 'fiscal.resultado.financiero']}
        defaultSelected={['fiscal.resultado.primario', 'fiscal.resultado.financiero']}
        defaultTransform="level"
        fallbackTransforms={['level']}
        defaultValuation="real"
        defaultRange="24m"
        kind="bar"
        {...common}
      />

      <FiscalTable
        title="Cuadro fiscal por partida"
        description="Ingresos, gastos y resultados. Subtotales: suma de las partidas publicadas. Variación real: comparación interanual de valores deflactados por IPC nacional."
        rows={FISCAL_CUADRO}
        pool={pool}
        realOf={realOf}
        realLabel={realLabel}
        source={source}
      />

      <ChartPanel
        title="Ingresos por concepto"
        description="Variación interanual real por defecto. Podés cambiar a valores nominales, nivel o acumulados."
        options={idsOf(['fiscal_totales', 'fiscal_ingresos_sub', 'fiscal_ingresos']).filter((id) => id.startsWith('fiscal.ingresos'))}
        defaultSelected={['fiscal.ingresos.tributarios', 'fiscal.ingresos.iva', 'fiscal.ingresos.ganancias', 'fiscal.ingresos.seguridad_social', 'fiscal.ingresos.derechos_exportacion']}
        defaultTransform="pct_yoy"
        defaultValuation="real"
        defaultRange="24m"
        pickerLabel="Partidas"
        {...common}
      />

      <ChartPanel
        title="Gastos por concepto"
        description="Variación interanual real por defecto. Podés cambiar a valores nominales, nivel o acumulados."
        options={idsOf(['fiscal_totales', 'fiscal_gastos_sub', 'fiscal_gastos', 'fiscal_capital', 'fiscal_resultados']).filter((id) => id.startsWith('fiscal.gastos'))}
        defaultSelected={['fiscal.gastos.primario', 'fiscal.gastos.prestaciones_sociales', 'fiscal.gastos.subsidios', 'fiscal.gastos.transf_provincias', 'fiscal.gastos.capital']}
        defaultTransform="pct_yoy"
        defaultValuation="real"
        defaultRange="24m"
        pickerLabel="Partidas"
        {...common}
      />
    </>
  );
}
