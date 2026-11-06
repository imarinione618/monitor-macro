'use client';

import { useMemo, useState } from 'react';
import type { MonetaryDef, MonetarySeries } from '@/monetary/types';
import { baseInstrumentComponents } from '@/monetary/analytics';
import type { IpcPoint } from '@/web/lib/monetaryChartModel';
import { SECTOR_LABELS } from '@/web/lib/monetaryChartModel';
import { selectableMonetarySeries } from '@/web/lib/monetarySelection';
import { MonetaryChartPanel } from './MonetaryChartPanel';
import { RepoRatesPanel } from './RepoRatesPanel';
import { Segmented } from './controls';

interface Props { series: MonetarySeries[]; ipc: IpcPoint[]; updatedAt: string | null; error?: string }

const ids = (series: MonetarySeries[], categories: string[]) => categories.flatMap(category => series.filter(s => s.def.category === category).slice(0, 1).map(s => s.def.id));

export function MonetaryDashboard({ series, ipc, updatedAt, error }: Props) {
  const [tab, setTab] = useState('tasas');
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [sector, setSector] = useState<'private' | 'public' | 'total'>('private');
  const available = useMemo(() => selectableMonetarySeries(series), [series]);
  const filter = (groups: MonetaryDef['group'][]) => available.filter(s => groups.includes(s.def.group));
  const passive = filter(['passive_rates', 'market_rates', 'policy_rates']).filter(s => s.def.category !== 'spread');
  const active = filter(['active_rates']);
  const spreads = available.filter(s => s.def.category === 'spread' || s.def.id.includes('spread'));
  const stocks = filter(['deposits', 'loans']).filter(s => s.def.currency === currency && s.def.sector === sector && !s.def.id.includes('ratio'));
  const deposits = stocks.filter(s => s.def.group === 'deposits');
  const loans = stocks.filter(s => s.def.group === 'loans');
  const totals = stocks.filter(s => s.def.category === 'total').sort((a, b) => Number(b.def.group === 'deposits') - Number(a.def.group === 'deposits'));
  const ratios = available.filter(s => (s.def.category === 'ratio' || s.def.id.includes('ratio')) && (s.def.currency === currency || s.def.id.endsWith(`.${currency}`)) && s.def.sector === sector);
  const base = filter(['base']).filter(s => s.def.category !== 'base_instrumentos');
  const instruments = filter(['instruments'])
    .filter(s => [152, 154, 155, 156, 196, 198].includes(s.def.bcraId))
    .map(s => ({ ...s, def: { ...s.def, regimeNotes: [] } }));
  const aggregates = filter(['aggregates']);
  const aggregateTotal = available.filter(s => s.def.category === 'base_instrumentos');
  const aggregateComponents = useMemo(() => baseInstrumentComponents(available), [available]);
  const common = { allSeries: series, ipc, asOf: updatedAt ?? undefined };
  const panel = (title: string, pool: MonetarySeries[], categories?: string[], description?: string, mode: 'rate' | 'stock' | 'ratio' | 'composition' = 'stock', defaultTransform?: 'pct_mom') => <MonetaryChartPanel key={`${title}-${currency}-${sector}`} title={title} description={description} series={pool} defaultIds={categories ? ids(pool, categories) : undefined} mode={mode} defaultTransform={defaultTransform} {...common} />;
  const depositParts = sector === 'public'
    ? currency === 'ARS' ? deposits.filter(s => ['monetario.vista.publicos.ARS','monetario.plazo.publicos.ARS','monetario.residuo_depositos.publicos.ARS'].includes(s.def.id)) : []
    : deposits.filter(s => ['cuenta_corriente', 'caja_ahorro', 'plazo_fijo', 'plazo_fijo_no_ajustable', 'plazo_fijo_ajustable', 'otros', 'cedro', 'residual', 'residuo'].includes(s.def.category));
  const loanParts = loans.filter(s => ['adelantos', 'documentos', 'hipotecarios', 'prendarios', 'personales', 'tarjetas', 'otros', 'residual', 'residuo'].includes(s.def.category));

  return <div className="monetary-dashboard">
    <div className="monetary-tabs" role="tablist" aria-label="Secciones monetarias">{[{ id: 'tasas', label: 'Tasas' }, { id: 'depositos', label: 'Depósitos y Préstamos' }, { id: 'variables', label: 'Variables Monetarias' }].map(item => <button key={item.id} type="button" role="tab" id={`monetary-tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`monetary-pane-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = ['tasas', 'depositos', 'variables'];
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
      const next = tabs[index]!;
      setTab(next);
      document.getElementById(`monetary-tab-${next}`)?.focus();
    }} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
    {error && <p className="notice notice-stale" role="status">Actualización monetaria: {error}. Se muestran los datos disponibles.</p>}
    {!series.some(s => s.observations.length) && <p className="callout">Todavía no hay observaciones monetarias almacenadas. Las demás secciones del dashboard siguen disponibles.</p>}
    {tab === 'tasas' && <div role="tabpanel" id="monetary-pane-tasas" aria-labelledby="monetary-tab-tasas">
      {panel('Tasas pasivas, de mercado y de referencia', passive, ['tamar', 'badlar', 'remunerada', 'caucion'], 'Convención original de cada tasa. Caución: tasa de referencia a 1 día de A3 Mercados. Los cambios se expresan en puntos porcentuales o básicos.', 'rate')}
      <RepoRatesPanel title="Repo BCRA, tasa de caución y TAMAR" description="Saldo de Repo BCRA (área, eje izquierdo, billones de ARS) frente a la caución a 1 día de A3 Mercados y la TAMAR de bancos privados (líneas, eje derecho, % TNA). Cada serie se dibuja en sus propias fechas publicadas." allSeries={series} asOf={updatedAt ?? undefined} />
      {panel('Tasas activas', active, ['personales', 'adelantos'], 'Préstamos personales, adelantos y otras líneas disponibles. Cada serie conserva su fecha y cobertura.', 'rate')}
      {spreads.length > 0 && panel('Spreads entre tasas comparables', spreads, undefined, 'Diferencias de tasas con igual convención, sobre fechas comunes. Unidad: puntos porcentuales.', 'rate')}
      <p className="monetary-status">Caución: tasa de referencia en pesos a 1 día hábil de A3 Mercados (índice I.CAUCION, mediana ponderada por volumen); no es una serie BCRA. La tasa de vista remunerada PSF corresponde a prestadores de servicios financieros. La tasa de política histórica se muestra separada, sin empalmar instrumentos.</p>
    </div>}
    {tab === 'depositos' && <div role="tabpanel" id="monetary-pane-depositos" aria-labelledby="monetary-tab-depositos">
      <div className="panel monetary-filters"><Segmented label="Moneda" value={currency} options={[{ value: 'ARS', label: 'Pesos (ARS)' }, { value: 'USD', label: 'Dólares (USD)' }]} onChange={setCurrency} /><Segmented label="Sector" value={sector} options={(['private', 'public', 'total'] as const).map(value => ({ value, label: SECTOR_LABELS[value], disabled: !available.some(s => ['deposits', 'loans'].includes(s.def.group) && s.def.currency === currency && s.def.sector === value) }))} onChange={setSector} /></div>
      {panel('Depósitos y préstamos — saldos', totals, undefined, 'Promedios mensuales como vista inicial. Los montos en dólares se muestran en dólares corrientes.')}
      {panel('Depósitos por categoría', deposits, ['total', 'cuenta_corriente', 'caja_ahorro'], 'Selección de aperturas. Valores nominales, reales (solo ARS), índice base 100 y variaciones por fecha.')}
      {panel('Préstamos por categoría', loans, ['total', 'personales', 'documentos'], 'La variación del saldo no equivale a nuevas colocaciones. Las agrupaciones se construyen con categorías mutuamente excluyentes.')}
      {panel('Variación mensual por categoría', [...deposits, ...loans], undefined, 'Comparación de promedios o cierres mensuales, sin ajuste estacional. Podés cambiar a variación interanual o pesos constantes.', 'stock', 'pct_mom')}
      {ratios.length > 0 && panel('Ratio préstamos / depósitos', ratios, undefined, 'Numerador y denominador con igual moneda, sector, cobertura y fecha.', 'ratio')}
      {depositParts.length > 0 && panel('Composición de depósitos', depositParts, undefined, 'Aperturas sin sumar nuevamente el total; el residuo se identifica cuando existe. No se interpretan faltantes como cero.', 'composition')}
      {loanParts.length > 0 && panel('Composición de préstamos', loanParts, undefined, 'Componentes de saldo sin superponer agrupaciones con sus aperturas. Un residuo negativo se muestra sin apilar.', 'composition')}
    </div>}
    {tab === 'variables' && <div role="tabpanel" id="monetary-pane-variables" aria-labelledby="monetary-tab-variables">
      {panel('Base monetaria y componentes', base, ['base_monetaria', 'circulante_publico'], 'La base monetaria se compara con sus componentes; no se suman nuevamente componentes incluidos en el total.')}
      {panel('Instrumentos monetarios por separado', instruments, ['pases_pasivos_imd', 'pases_activos_imd', 'otros'])}
      {aggregateTotal.length > 0 ? panel('Base monetaria más instrumentos elegibles', aggregateTotal, undefined, 'Base monetaria + otras letras + LELIQ/NOTALIQ + pases pasivos + Repo BCRA. Repo se incorpora desde el 15/07/2025; antes se muestra el agregado histórico sin Repo. Cálculo propio sobre fechas comunes.') : <p className="monetary-status">Base monetaria más instrumentos: total no disponible cuando falta un componente elegible o no existe cobertura simultánea. Los instrumentos se pueden consultar individualmente.</p>}
      {panel('Composición de base monetaria e instrumentos elegibles', aggregateComponents, undefined, 'Incluye Repo BCRA (serie 198) desde el 15/07/2025. Antes se conserva la composición histórica sin Repo; su aporte cero indica exclusión de la cobertura, no un saldo oficial cero.', 'composition')}
      {panel('Agregados monetarios privados', aggregates.filter(s => s.def.sector === 'private'), ['m1', 'm2', 'm3'], 'M1, M2 y M3 privados: cálculos propios con componentes de la API BCRA desde 2005. M2 transaccional: serie oficial.')}
      {panel('Agregados monetarios totales', aggregates.filter(s => s.def.sector === 'total'), ['m1', 'm2', 'm3'], 'M1, M2 y M3: cálculos propios con componentes de la API BCRA desde 2005. Para cierres mensuales se prioriza la serie oficial compatible; promedio y cierre no se intercambian.')}
    </div>}
  </div>;
}
