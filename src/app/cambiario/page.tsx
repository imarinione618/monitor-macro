import type { Metadata } from 'next';
import { formatPeriodLong } from '@/core/periods';
import { SERIES } from '@/core/registry';
import { ChartPanel } from '@/web/components/ChartPanel';
import { PageIntro } from '@/web/components/PageIntro';
import { SnapshotPanel } from '@/web/components/SnapshotPanel';
import { StoreProblem } from '@/web/components/StateMessages';
import { formatDateTimeAR, formatWithUnit } from '@/web/lib/format';
import { flowSummary } from '@/web/lib/kpi';
import type { ClientSeries } from '@/web/lib/types';
import { getClientSeriesList, getStoreState } from '@/web/server/store';

// Sitio estático: se genera con los datos del store al momento del build (npm run build).
export const dynamic = 'force-static';
export const metadata: Metadata = { title: 'Balance cambiario' };

const ids = (family: string) => SERIES.filter((s) => s.family === family).map((s) => s.id);
const C = (id: string) => `cambiario.${id}`;

/** Cuadro resumen: [id, nivel de sangría]. */
const RESUMEN: [string, number][] = [
  [C('resultado.cuenta_corriente'), 0],
  [C('cc.bienes'), 1],
  [C('cc.servicios'), 1],
  [C('cc.ingreso_primario'), 1],
  [C('cc.ingreso_secundario'), 1],
  [C('resultado.capital_financiera'), 0],
  [C('cf.fae_spnf'), 1],
  [C('cf.prestamos'), 1],
  [C('cf.fmi'), 1],
  [C('cf.sector_publico'), 1],
  [C('resultado.no_informado'), 0],
  [C('reservas.transacciones'), 0],
];

export default function CambiarioPage() {
  const state = getStoreState();
  if (state.status !== 'ok') return <StoreProblem state={state} />;
  const synthetic = state.dataMode === 'synthetic';
  const resumen = getClientSeriesList(RESUMEN.map(([id]) => id));
  const indent = new Map(RESUMEN);
  const summaries = resumen.filter((s) => !s.missing).map((s) => ({ s, f: flowSummary(s.def, s.observations) }));
  const period = summaries.find((x) => x.f.period)?.f.period ?? null;
  const samePeriod = summaries.every((x) => x.f.period === period);
  const pool = (families: string[]) => getClientSeriesList(families.flatMap(ids));

  if (!summaries.length)
    return (
      <PageIntro title="Balance cambiario">
        <p>
          Todavía no hay datos del balance cambiario en el store. Ejecutá <code>npm run data:refresh -- --solo-externas</code>.
        </p>
      </PageIntro>
    );

  const cobrosSector = pool(['bc_cobros_sector']);
  const pagosSector = pool(['bc_pagos_sector']);
  const servCobros = pool(['bc_servicios_cobros']);
  const servPagos = pool(['bc_servicios_pagos']);
  // En los gráficos que mezclan cobros y pagos, el nombre corto aclara cuál es cuál.
  const tag = (list: ClientSeries[], label: string) => list.map((s) => ({ ...s, def: { ...s.def, shortName: `${s.def.shortName} (${label})` } }));

  return (
    <>
      <PageIntro title="Balance cambiario">
        <p>
          Operaciones del mercado de cambios y movimientos de reservas internacionales que publica el BCRA (base caja), en millones de USD. Positivo = ingreso neto
          de divisas; negativo = egreso neto. Es distinto de la balanza de pagos del INDEC (criterio devengado, todas las transacciones con el exterior).
        </p>
      </PageIntro>

      <section className="panel" aria-labelledby="bc-resumen">
        <h2 id="bc-resumen">Mes, acumulado del año y últimos 12 meses</h2>
        <p className="chart-subtitle">
          {period ? `Último período: ${formatPeriodLong(period)}${samePeriod ? '' : ' (las series difieren en su último período)'}` : 'Sin datos'} · Millones de
          USD · Comparación interanual: diferencia en millones de USD
        </p>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Resumen del balance cambiario">
          <table className="data-table">
            <caption>Balance cambiario: último mes, acumulado del año y suma de 12 meses, con su diferencia interanual.</caption>
            <thead>
              <tr>
                <th scope="col">Concepto</th>
                <th scope="col">Mes</th>
                <th scope="col">Dif. i.a.</th>
                <th scope="col">Acum. año</th>
                <th scope="col">Dif. i.a.</th>
                <th scope="col">12 meses</th>
                <th scope="col">Dif. i.a.</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(({ s, f }) => {
                const level = indent.get(s.def.id) ?? 0;
                return (
                  <tr key={s.def.id}>
                    <th scope="row" style={{ paddingLeft: `${0.5 + level * 1.2}rem`, fontWeight: level ? 400 : 700 }}>
                      {s.def.shortName}
                      {s.stale && <span className="badge badge-stale">datos anteriores</span>}
                    </th>
                    <td>{formatWithUnit(f.month.value, s.def.unit, { decimals: 0 })}</td>
                    <td>{formatWithUnit(f.month.cmp, f.cmpUnit, { decimals: 0, signed: true })}</td>
                    <td>{formatWithUnit(f.ytd.value, s.def.unit, { decimals: 0 })}</td>
                    <td>{formatWithUnit(f.ytd.cmp, f.cmpUnit, { decimals: 0, signed: true })}</td>
                    <td>{formatWithUnit(f.sum12.value, s.def.unit, { decimals: 0 })}</td>
                    <td>{formatWithUnit(f.sum12.cmp, f.cmpUnit, { decimals: 0, signed: true })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Datos consultados el {formatDateTimeAR(resumen[0]?.retrievedAt)}. Cuenta corriente + cuenta capital y financiera + concepto no informado = variación de
          reservas por transacciones. Acumulados y sumas móviles: cálculo propio; nulos si falta algún mes del tramo. Fuente: one618 en base a BCRA.
        </p>
      </section>

      <ChartPanel
        title="Resultado del balance cambiario"
        description="Barras apiladas: la suma de los tres componentes es la variación de reservas internacionales por transacciones."
        pool={pool(['bc_resultado'])}
        options={ids('bc_resultado')}
        defaultSelected={ids('bc_resultado')}
        defaultTransform="level"
        fallbackTransforms={['level']}
        defaultRange="24m"
        kind="stacked"
        pickerLabel="Componentes"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Variación de reservas internacionales"
        description="Por transacciones (resultado del balance cambiario) y contable: la diferencia es el ajuste por tipo de pase y valuación."
        pool={pool(['bc_reservas'])}
        options={ids('bc_reservas')}
        defaultSelected={[C('reservas.transacciones'), C('reservas.contable')]}
        defaultTransform="level"
        fallbackTransforms={['level']}
        defaultRange="24m"
        kind="bar"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Cuenta corriente cambiaria por componente"
        description="Barras apiladas: bienes + servicios + ingreso primario + ingreso secundario = cuenta corriente cambiaria."
        pool={pool(['bc_cc'])}
        options={ids('bc_cc')}
        defaultSelected={ids('bc_cc')}
        defaultTransform="level"
        fallbackTransforms={['level']}
        defaultRange="24m"
        kind="stacked"
        pickerLabel="Componentes"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Cobros y pagos de bienes y servicios"
        description="Montos brutos ingresados y egresados por el mercado de cambios. No son las exportaciones e importaciones registradas por el INDEC: difieren en el momento del pago y la financiación."
        pool={pool(['bc_cc_brutos'])}
        options={ids('bc_cc_brutos')}
        defaultSelected={[C('bienes.cobros'), C('bienes.pagos')]}
        defaultTransform="level"
        defaultRange="5y"
        pickerLabel="Series"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Cuenta capital y financiera cambiaria por concepto"
        description="Saldo neto de cada concepto. La suma de todos los conceptos es la cuenta capital y financiera cambiaria."
        pool={pool(['bc_financiera'])}
        options={ids('bc_financiera')}
        defaultSelected={[C('cf.fae_spnf'), C('cf.prestamos'), C('cf.fmi'), C('cf.sector_publico')]}
        defaultTransform="level"
        defaultRange="24m"
        kind="bar"
        pickerLabel="Conceptos"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Formación de activos externos de personas humanas y empresas"
        description="Sector privado no financiero. Egresos: compras de activos externos (billetes, depósitos y otros activos); ingresos: ventas. El neto negativo indica compras netas."
        pool={getClientSeriesList([...ids('bc_fae'), C('cf.fae_spnf')])}
        options={[...ids('bc_fae'), C('cf.fae_spnf')]}
        defaultSelected={[...ids('bc_fae'), C('cf.fae_spnf')]}
        defaultTransform="level"
        defaultRange="24m"
        pickerLabel="Series"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Intereses, utilidades y dividendos"
        description="Ingreso primario de la cuenta corriente cambiaria. Netos (ingresos − egresos) y pagos de intereses por acreedor."
        pool={pool(['bc_ingreso_primario'])}
        options={ids('bc_ingreso_primario')}
        defaultSelected={[C('ip.intereses'), C('ip.utilidades')]}
        defaultTransform="level"
        defaultRange="24m"
        kind="bar"
        pickerLabel="Series"
        synthetic={synthetic}
      />

      <SnapshotPanel
        title="Cobros de exportaciones de bienes por sector"
        description="Sector de actividad del cliente que liquida las divisas. Por defecto, suma de los últimos 12 meses."
        series={cobrosSector}
        referenceId={C('bienes_sector.cobros.total')}
        transforms={['sum_12m', 'level', 'sum_12m_pct_yoy']}
        defaultTransform="sum_12m"
        synthetic={synthetic}
      />

      <SnapshotPanel
        title="Pagos de importaciones de bienes por sector"
        description="Sector de actividad del cliente que accede al mercado de cambios. Por defecto, suma de los últimos 12 meses."
        series={pagosSector}
        referenceId={C('bienes_sector.pagos.total')}
        transforms={['sum_12m', 'level', 'sum_12m_pct_yoy']}
        defaultTransform="sum_12m"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Cobros y pagos de bienes por sector: evolución"
        description="Elegí hasta 8 sectores (cobros de exportaciones o pagos de importaciones)."
        pool={[...tag(cobrosSector, 'cobros'), ...tag(pagosSector, 'pagos')]}
        options={[...ids('bc_cobros_sector'), ...ids('bc_pagos_sector')]}
        defaultSelected={[C('bienes_sector.cobros.oleaginosos_cerealeros'), C('bienes_sector.cobros.petroleo'), C('bienes_sector.cobros.mineria'), C('bienes_sector.cobros.automotriz')]}
        defaultTransform="sum_12m"
        defaultRange="5y"
        pickerLabel="Sectores"
        synthetic={synthetic}
      />

      <SnapshotPanel
        title="Cobros de servicios por tipo"
        description="Por defecto, suma de los últimos 12 meses."
        series={servCobros}
        referenceId={C('servicios_tipo.cobros.total')}
        transforms={['sum_12m', 'level', 'sum_12m_pct_yoy']}
        defaultTransform="sum_12m"
        synthetic={synthetic}
      />

      <SnapshotPanel
        title="Pagos de servicios por tipo"
        description="Por defecto, suma de los últimos 12 meses."
        series={servPagos}
        referenceId={C('servicios_tipo.pagos.total')}
        transforms={['sum_12m', 'level', 'sum_12m_pct_yoy']}
        defaultTransform="sum_12m"
        synthetic={synthetic}
      />

      <ChartPanel
        title="Cobros y pagos de servicios por tipo: evolución"
        description="Elegí hasta 8 tipos de servicio (cobros o pagos)."
        pool={[...tag(servCobros, 'cobros'), ...tag(servPagos, 'pagos')]}
        options={[...ids('bc_servicios_cobros'), ...ids('bc_servicios_pagos')]}
        defaultSelected={[C('servicios_tipo.pagos.turismo_viajes'), C('servicios_tipo.cobros.turismo_viajes'), C('servicios_tipo.cobros.empresariales'), C('servicios_tipo.pagos.fletes')]}
        defaultTransform="level"
        defaultRange="24m"
        pickerLabel="Servicios"
        synthetic={synthetic}
      />
    </>
  );
}
