import type { Metadata } from 'next';
import { COMEX_NO_DISPONIBLE, SERIES } from '@/core/registry';
import { formatPeriodLong } from '@/core/periods';
import { ChartPanel } from '@/web/components/ChartPanel';
import { KpiCard } from '@/web/components/KpiCard';
import { PageIntro, Unavailable } from '@/web/components/PageIntro';
import { StoreProblem } from '@/web/components/StateMessages';
import { formatDateTimeAR, formatWithUnit } from '@/web/lib/format';
import { flowSummary } from '@/web/lib/kpi';
import { getClientSeriesList, getStoreState } from '@/web/server/store';

// Sitio estático: se genera con los datos del store al momento del build (npm run build).
export const dynamic = 'force-static';
export const metadata: Metadata = { title: 'Comercio exterior' };

const ids = (family: string) => SERIES.filter((s) => s.family === family).map((s) => s.id);
const TOTALS = ['comex.expo.total', 'comex.impo.total', 'comex.saldo'];

export default function ComercioPage() {
  const state = getStoreState();
  if (state.status !== 'ok') return <StoreProblem state={state} />;
  const synthetic = state.dataMode === 'synthetic';
  const totals = getClientSeriesList(TOTALS);
  const summaries = totals.map((s) => ({ s, f: flowSummary(s.def, s.observations) }));
  const period = summaries.find((x) => x.f.period)?.f.period ?? null;
  const samePeriod = summaries.every((x) => x.f.period === period);
  const socios = ids('socios');

  return (
    <>
      <PageIntro title="Comercio exterior">
        <p>
          Intercambio comercial de bienes en millones de USD corrientes: exportaciones FOB, importaciones CIF y saldo (X FOB − M CIF). Son valores, no
          volúmenes.
        </p>
      </PageIntro>

      <div className="kpi-grid kpi-grid-3">
        {totals.map((s) => (
          <KpiCard key={s.def.id} series={s} transform="level" compare={s.def.measure === 'balance' ? 'diff_yoy_abs' : 'pct_yoy'} />
        ))}
      </div>

      <section className="panel" aria-labelledby="comex-resumen">
        <h2 id="comex-resumen">Mes, acumulado del año y últimos 12 meses</h2>
        <p className="chart-subtitle">
          {period ? `Último período: ${formatPeriodLong(period)}${samePeriod ? '' : ' (las series difieren en su último período)'}` : 'Sin datos'} · Millones de
          USD · Variación interanual en % (saldo: diferencia en millones de USD)
        </p>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Resumen de comercio exterior">
          <table className="data-table">
            <caption>Comercio exterior de bienes: último mes, acumulado del año y suma de 12 meses, con su comparación interanual.</caption>
            <thead>
              <tr>
                <th scope="col">Serie</th>
                <th scope="col">Mes</th>
                <th scope="col">i.a.</th>
                <th scope="col">Acum. año</th>
                <th scope="col">i.a.</th>
                <th scope="col">12 meses</th>
                <th scope="col">i.a.</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(({ s, f }) => (
                <tr key={s.def.id}>
                  <th scope="row">
                    {s.def.shortName}
                    {s.stale && <span className="badge badge-stale">datos anteriores</span>}
                  </th>
                  <td>{formatWithUnit(f.month.value, s.def.unit, { decimals: 0 })}</td>
                  <td>{formatWithUnit(f.month.cmp, f.cmpUnit, { signed: true })}</td>
                  <td>{formatWithUnit(f.ytd.value, s.def.unit, { decimals: 0 })}</td>
                  <td>{formatWithUnit(f.ytd.cmp, f.cmpUnit, { signed: true })}</td>
                  <td>{formatWithUnit(f.sum12.value, s.def.unit, { decimals: 0 })}</td>
                  <td>{formatWithUnit(f.sum12.cmp, f.cmpUnit, { signed: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Datos consultados el {formatDateTimeAR(totals[0]?.retrievedAt)}. Acumulados y sumas móviles: cálculo propio; nulos si falta algún mes del tramo.
        </p>
      </section>

      <ChartPanel
        title="Exportaciones e importaciones"
        description="Elegí la transformación para ver el acumulado del año o la suma de 12 meses."
        pool={totals}
        options={TOTALS}
        defaultSelected={['comex.expo.total', 'comex.impo.total']}
        defaultTransform="sum_12m"
        defaultRange="5y"
        pickerLabel="Series"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Saldo comercial"
        description="Exportaciones FOB − importaciones CIF."
        pool={getClientSeriesList(['comex.saldo'])}
        options={['comex.saldo']}
        defaultSelected={['comex.saldo']}
        defaultTransform="level"
        defaultRange="24m"
        kind="bar"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Exportaciones por grandes rubros"
        description="Barras apiladas: la suma de los rubros es el total exportado."
        pool={getClientSeriesList(ids('expo_rubros'))}
        options={ids('expo_rubros')}
        defaultSelected={ids('expo_rubros')}
        defaultTransform="level"
        defaultRange="24m"
        kind="stacked"
        pickerLabel="Rubros"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Importaciones por usos económicos"
        description="Barras apiladas: la suma de los usos es el total importado."
        pool={getClientSeriesList(ids('impo_usos'))}
        options={ids('impo_usos')}
        defaultSelected={ids('impo_usos')}
        defaultTransform="level"
        defaultRange="24m"
        kind="stacked"
        pickerLabel="Usos"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Principales socios comerciales"
        description="Brasil, China y Estados Unidos."
        callout='Advertencia: las celdas con secreto estadístico ("s") no se publican por país y no se incluyen en estas sumas; el comercio con cada socio puede estar subestimado.'
        pool={getClientSeriesList(socios)}
        options={socios}
        defaultSelected={['comex.expo.pais.brasil', 'comex.expo.pais.china', 'comex.expo.pais.eeuu']}
        defaultTransform="sum_12m"
        defaultRange="5y"
        pickerLabel="Socios"
        synthetic={synthetic}
      />

      <Unavailable items={COMEX_NO_DISPONIBLE} />
    </>
  );
}
