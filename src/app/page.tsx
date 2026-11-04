import Link from 'next/link';
import { headlineSeries } from '@/core/registry';
import { TOPIC_LABELS, type Topic } from '@/core/types';
import { KpiCard } from '@/web/components/KpiCard';
import { PageIntro } from '@/web/components/PageIntro';
import { StoreProblem } from '@/web/components/StateMessages';
import { formatDateTimeAR } from '@/web/lib/format';
import { getClientSeries, getStoreState } from '@/web/server/store';
import { readMonetaryStore } from '@/monetary/store';

// Sitio estático: se genera con los datos del store al momento del build (npm run build).
export const dynamic = 'force-static';

const TOPIC_HREF: Record<Topic, string> = { actividad: '/actividad', laboral: '/laboral', precios: '/precios', comex: '/comercio' };

export default function ResumenPage() {
  const state = getStoreState();
  if (state.status !== 'ok') return <StoreProblem state={state} />;
  const cards = headlineSeries()
    .map((def) => ({ def, s: getClientSeries(def.id) }))
    .filter((x): x is { def: typeof x.def; s: NonNullable<typeof x.s> } => !!x.s);
  const stale = cards.filter((c) => c.s.stale);
  const run = state.manifest?.lastRun;
  const monetary = readMonetaryStore().series.filter(s => [44, 7, 15].includes(s.def.bcraId));

  return (
    <>
      <PageIntro title="Resumen general">
        <p>
          Últimos datos publicados por el INDEC y el BCRA. Cada indicador muestra <strong>su propio período de referencia</strong>: no todos se publican con la
          misma frecuencia ni el mismo rezago.
        </p>
      </PageIntro>

      {(stale.length > 0 || (run && (!run.ok || run.partial))) && (
        <div className="notice notice-stale block" role="status">
          <span className="notice-tag">Atención</span>{' '}
          {run && (!run.ok || run.partial) && <>La última actualización ({formatDateTimeAR(run.startedAt)}) terminó {run.partial ? 'en forma parcial' : 'con errores'}. </>}
          {stale.length > 0 && <>Indicadores con datos conservados de una actualización anterior: {stale.map((c) => c.def.shortName).join(', ')}. </>}
          Ver <Link href="/fuentes">Fuentes y estado</Link>.
        </div>
      )}

      <div className="kpi-grid">
        {cards.map(({ def, s }) => (
          <KpiCard
            key={def.id}
            series={s}
            transform={def.headline!.transform}
            compare={def.headline!.compare}
            href={TOPIC_HREF[def.topic]}
            title={def.name}
          />
        ))}
      </div>

      <section aria-label="Indicadores monetarios" className="block">
        <h2>Monetario</h2>
        <div className="kpi-grid">
          {monetary.map(s => {
            const last = s.observations.filter(o => o.value !== null).at(-1);
            return <article key={s.def.id} className="kpi"><Link href="/monetario" className="kpi-link">
              <h3 className="kpi-name">{s.def.shortName}</h3>
              <p className="kpi-value">{last?.value?.toLocaleString('es-AR', {maximumFractionDigits:2}) ?? 'Sin datos'}</p>
              <p className="kpi-label">{s.def.unit} · {last?.date}</p>
              <p className="kpi-foot">BCRA · Consultado: {formatDateTimeAR(s.retrievedAt)}{s.stale ? ' · Datos anteriores' : ''}</p>
            </Link></article>;
          })}
        </div>
      </section>

      <section className="panel">
        <h2>Secciones</h2>
        <ul className="topic-links">
          {(Object.keys(TOPIC_HREF) as Topic[]).map((t) => (
            <li key={t}>
              <Link href={TOPIC_HREF[t]}>{TOPIC_LABELS[t]}</Link>
            </li>
          ))}
          <li>
            <Link href="/monetario">Monetario: tasas, depósitos, préstamos y agregados</Link>
          </li>
          <li>
            <Link href="/fuentes">Fuentes, metodología y estado de actualización</Link>
          </li>
        </ul>
        <p className="muted small">
          Variaciones mensuales de actividad (EMAE, IPI) se calculan sobre la serie desestacionalizada; la interanual, sobre la serie original. Tasas: diferencias en
          puntos porcentuales. Saldo comercial: diferencia absoluta en millones de USD.
        </p>
      </section>
    </>
  );
}
