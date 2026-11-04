'use client';

import { useMemo, useState } from 'react';
import type { MonetaryDef, MonetarySeries } from '@/monetary/types';
import type { IpcPoint } from '@/web/lib/monetaryChartModel';
import { SECTOR_LABELS } from '@/web/lib/monetaryChartModel';
import { MonetaryChartPanel } from './MonetaryChartPanel';
import { Segmented } from './controls';

interface Props { series: MonetarySeries[]; ipc: IpcPoint[]; updatedAt: string | null; error?: string }

/** Prefiere la diaria con su companion mensual; conserva mensuales independientes. */
function selectable(series: MonetarySeries[]): MonetarySeries[] {
  const companions = new Set(series.map(s => s.def.monthlyCompanionId).filter(Boolean));
  const daily = new Set(series.filter(s => s.def.frequency === 'D').map(s => `${s.def.group}|${s.def.category}|${s.def.currency}|${s.def.sector}`));
  return series.filter(s => !companions.has(s.def.id) && (s.def.frequency === 'D' || !daily.has(`${s.def.group}|${s.def.category}|${s.def.currency}|${s.def.sector}`)));
}
const ids = (series: MonetarySeries[], categories: string[]) => categories.flatMap(category => series.filter(s => s.def.category === category).slice(0, 1).map(s => s.def.id));

export function MonetaryDashboard({ series, ipc, updatedAt, error }: Props) {
  const [tab, setTab] = useState('tasas');
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [sector, setSector] = useState<'private' | 'public' | 'total'>('private');
  const available = useMemo(() => selectable(series), [series]);
  const filter = (groups: MonetaryDef['group'][]) => available.filter(s => groups.includes(s.def.group));
  const passive = filter(['passive_rates', 'policy_rates']).filter(s => s.def.category !== 'spread');
  const active = filter(['active_rates']);
  const spreads = available.filter(s => s.def.category === 'spread' || s.def.id.includes('spread'));
  const stocks = filter(['deposits', 'loans']).filter(s => s.def.currency === currency && s.def.sector === sector && !s.def.id.includes('ratio'));
  const deposits = stocks.filter(s => s.def.group === 'deposits');
  const loans = stocks.filter(s => s.def.group === 'loans');
  const totals = stocks.filter(s => s.def.category === 'total');
  const ratios = available.filter(s => (s.def.category === 'ratio' || s.def.id.includes('ratio')) && (s.def.currency === currency || s.def.id.endsWith(`.${currency}`)) && s.def.sector === sector);
  const base = filter(['base']).filter(s => s.def.category !== 'base_instrumentos');
  const instruments = filter(['instruments']);
  const aggregates = filter(['aggregates']);
  const aggregateTotal = available.filter(s => s.def.category === 'base_instrumentos');
  const common = { allSeries: series, ipc, asOf: updatedAt ?? undefined };
  const panel = (title: string, pool: MonetarySeries[], categories?: string[], description?: string, mode: 'rate' | 'stock' | 'ratio' | 'composition' = 'stock', defaultTransform?: 'pct_mom') => <MonetaryChartPanel key={`${title}-${currency}-${sector}`} title={title} description={description} series={pool} defaultIds={categories ? ids(pool, categories) : undefined} mode={mode} defaultTransform={defaultTransform} {...common} />;
  const depositParts = sector === 'public'
    ? currency === 'ARS' ? deposits.filter(s => [1230,1231].includes(s.def.bcraId) || s.def.id === 'monetario.residuo_depositos.publicos.ARS') : []
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
      {panel('Tasas pasivas y de referencia', passive, ['tamar', 'badlar', 'remunerada'], 'Convención original de cada tasa. Los cambios se expresan en puntos porcentuales o básicos.', 'rate')}
      {panel('Tasas activas', active, ['personales', 'adelantos'], 'Préstamos personales, adelantos y otras líneas disponibles. Cada serie conserva su fecha y cobertura.', 'rate')}
      {spreads.length > 0 && panel('Spreads entre tasas comparables', spreads, undefined, 'Diferencias de tasas con igual convención, sobre fechas comunes. Unidad: puntos porcentuales.', 'rate')}
      <p className="monetary-status">Caución pendiente: no se incorporó una serie sin verificar mercado, plazo y fuente. La tasa de vista remunerada PSF corresponde a prestadores de servicios financieros. La tasa de política histórica se muestra separada, sin empalmar instrumentos.</p>
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
      {panel('Instrumentos monetarios por separado', instruments, undefined, 'Cada instrumento conserva emisor, naturaleza y vigencia. Pases activos y títulos del Tesoro no se suman como pasivos monetarios del BCRA.')}
      {aggregateTotal.length > 0 ? panel('Base monetaria más instrumentos elegibles', aggregateTotal, undefined, 'Construcción propia con componentes auditados, fechas comunes y sin imputar cero a datos faltantes. La historia del total puede terminar antes que la de sus componentes: un instrumento sin dato impide calcular un total actual.') : <p className="monetary-status">Base monetaria más instrumentos: total no disponible cuando falta un componente elegible o no existe cobertura simultánea. Los instrumentos se pueden consultar individualmente.</p>}
      {panel('Composición de base monetaria e instrumentos elegibles', available.filter(s => [1248, 1258, 1260, 1262].includes(s.def.bcraId)), undefined, 'Construcción propia v1 = base monetaria contable + otras letras BCRA en ARS + LELIQ/NOTALIQ + pases pasivos. Excluye activos, LEFI del Tesoro y componentes ya incluidos en la base.', 'composition')}
      {panel('Agregados monetarios privados', aggregates.filter(s => s.def.sector === 'private'), ['m1', 'm2', 'm3'], 'M2 y M2 transaccional oficiales. M1 y M3 privados: construcciones propias sobre componentes oficiales desde 2005; consultá la definición de cada serie.')}
      {panel('Agregados monetarios totales', aggregates.filter(s => s.def.sector === 'total'), ['m1', 'm2', 'm3'], 'Se conserva la convención de cada serie oficial; promedio y cierre no se intercambian.')}
    </div>}
  </div>;
}
