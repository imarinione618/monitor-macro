import type { Metadata } from 'next';
import { DATASETS } from '@/core/datasets';
import { formatPeriodShort } from '@/core/periods';
import { ACTIVIDAD_NO_DISPONIBLE, COMEX_NO_DISPONIBLE, findSeries, LABORAL_COMPLEMENTARIAS, requiredDatasets, SERIES } from '@/core/registry';
import { FREQUENCY_LABELS, TOPIC_LABELS, type RevisionRecord, type SeriesStatus, type Topic } from '@/core/types';
import { PageIntro } from '@/web/components/PageIntro';
import { formatDateTimeAR, formatNumber } from '@/web/lib/format';
import { getRecentRevisions, getStoreState } from '@/web/server/store';

// Sitio estático: se genera con los datos del store al momento del build (npm run build).
export const dynamic = 'force-static';
export const metadata: Metadata = { title: 'Fuentes y estado' };

const STATUS_LABELS: Record<SeriesStatus, string> = {
  verificado: 'Verificada',
  pendiente_verificacion: 'Pendiente de verificación',
  no_encontrado: 'No encontrada en la API',
  fuente_complementaria: 'Fuente complementaria',
};

const REV_LABELS: Record<RevisionRecord['kind'], string> = {
  revised: 'Revisado',
  added_historical: 'Agregado (histórico)',
  removed: 'Eliminado',
};

const FLAGS: [string, string][] = [
  ['*', 'Dato provisorio'],
  ['**', 'Dato preliminar'],
  ['e', 'Dato estimado'],
  ['i', 'Dato imputado'],
  ['u', 'Dato de calidad inferior'],
  ['-', 'Cero absoluto'],
  ['.', 'Dato no registrado'],
  ['...', 'Dato no disponible'],
  ['///', 'No corresponde'],
  ['s', 'Secreto estadístico (confidencial)'],
];

export default function FuentesPage() {
  const state = getStoreState();
  const m = state.manifest;
  const revisions = state.status === 'ok' ? getRecentRevisions(60) : [];
  const datasets = requiredDatasets();
  const topics = Object.keys(TOPIC_LABELS) as Topic[];
  const pendientes = SERIES.filter((s) => s.status === 'no_encontrado' || s.status === 'fuente_complementaria');

  return (
    <>
      <PageIntro title="Fuentes, metodología y estado de actualización">
        <p>
          Todas las series provienen del Catálogo API-INDEC. El dashboard lee el store local normalizado; no consulta la API en cada visita. Período de
          referencia, fecha de publicación y fecha de consulta son cosas distintas: acá se informa la fecha de consulta (<em>retrievedAt</em>).
        </p>
      </PageIntro>

      <section className="panel" aria-labelledby="estado">
        <h2 id="estado">Estado general</h2>
        {state.status === 'error' && (
          <p className="notice notice-error block" role="alert">
            {state.error}
          </p>
        )}
        {state.status === 'empty' && (
          <p className="notice notice-missing block">
            Store vacío (<code>{state.dirLabel}</code>). Ejecutá <code>npm run data:refresh</code>.
          </p>
        )}
        <dl className="kv">
          <div>
            <dt>Modo de datos</dt>
            <dd>{m?.dataMode === 'synthetic' ? <strong className="warn-text">Sintéticos (no reales)</strong> : m ? 'Reales (API INDEC)' : 's/d'}</dd>
          </div>
          <div>
            <dt>Directorio del store</dt>
            <dd>
              <code>{state.dirLabel}</code>
            </dd>
          </div>
          <div>
            <dt>Manifest generado</dt>
            <dd>{formatDateTimeAR(m?.generatedAt)}</dd>
          </div>
          <div>
            <dt>Última corrida</dt>
            <dd>
              {m?.lastRun ? (
                <>
                  {formatDateTimeAR(m.lastRun.startedAt)} → {m.lastRun.finishedAt ? formatDateTimeAR(m.lastRun.finishedAt) : 'sin finalizar'} ·{' '}
                  {m.lastRun.ok ? (m.lastRun.partial ? 'parcial' : 'OK') : <strong className="warn-text">con errores</strong>}
                  <span className="muted small"> ({m.lastRun.runId})</span>
                </>
              ) : (
                's/d'
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel" aria-labelledby="datasets">
        <h2 id="datasets">Datasets del INDEC</h2>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Estado por dataset">
          <table className="data-table text-table">
            <caption>Estado de actualización por endpoint de la API (última consulta exitosa, errores y metodología).</caption>
            <thead>
              <tr>
                <th scope="col">Dataset</th>
                <th scope="col">Último éxito</th>
                <th scope="col">Último intento</th>
                <th scope="col">Estado</th>
                <th scope="col">Filas</th>
                <th scope="col">Metodología</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((id) => {
                const ds = DATASETS[id];
                const st = m?.datasets[id];
                return (
                  <tr key={id}>
                    <th scope="row">
                      {ds.title}
                      <div className="muted small">
                        <code>{ds.path}</code> · {ds.producer}
                      </div>
                    </th>
                    <td>{formatDateTimeAR(st?.lastSuccessAt)}</td>
                    <td>{formatDateTimeAR(st?.lastAttemptAt)}</td>
                    <td>
                      {!st ? (
                        <span className="muted">Sin registro{m?.dataMode === 'synthetic' ? ' (store sintético)' : ''}</span>
                      ) : st.ok ? (
                        'OK'
                      ) : (
                        <span className="warn-text">
                          Error {st.error?.kind ?? ''}
                          {st.error?.httpStatus ? ` (HTTP ${st.error.httpStatus})` : ''}: {st.error?.message ?? 's/d'}
                        </span>
                      )}
                    </td>
                    <td>{st?.rowsFetched !== undefined ? formatNumber(st.rowsFetched, 0) : 's/d'}</td>
                    <td>
                      {ds.methodologyUrl ? (
                        <a href={ds.methodologyUrl} target="_blank" rel="noopener noreferrer">
                          Documento
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-labelledby="series">
        <h2 id="series">Series ({SERIES.length})</h2>
        {topics.map((t) => {
          const list = SERIES.filter((s) => s.topic === t);
          const staleCount = list.filter((s) => m?.series[s.id]?.stale).length;
          return (
            <details key={t} className="series-group">
              <summary>
                {TOPIC_LABELS[t]} — {list.length} series{staleCount ? ` · ${staleCount} con datos anteriores` : ''}
              </summary>
              <div className="table-scroll" tabIndex={0} role="region" aria-label={`Series de ${TOPIC_LABELS[t]}`}>
                <table className="data-table text-table">
                  <caption>Series de {TOPIC_LABELS[t]}: cobertura y estado en el store.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Serie</th>
                      <th scope="col">Frec.</th>
                      <th scope="col">Unidad</th>
                      <th scope="col">Desde</th>
                      <th scope="col">Hasta</th>
                      <th scope="col">Obs.</th>
                      <th scope="col">Consultado</th>
                      <th scope="col">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((s) => {
                      const ms = m?.series[s.id];
                      return (
                        <tr key={s.id}>
                          <th scope="row">
                            {s.name}
                            <div className="muted small">
                              <code>{s.id}</code> · {s.geography}
                              {s.source.kind === 'derived' ? ' · cálculo propio' : ''}
                            </div>
                          </th>
                          <td>{FREQUENCY_LABELS[s.frequency]}</td>
                          <td>{s.unit}</td>
                          <td>{ms?.firstPeriod ? formatPeriodShort(ms.firstPeriod) : 's/d'}</td>
                          <td>{ms?.lastPeriod ? formatPeriodShort(ms.lastPeriod) : 's/d'}</td>
                          <td>{ms ? formatNumber(ms.count, 0) : 's/d'}</td>
                          <td>{formatDateTimeAR(ms?.retrievedAt)}</td>
                          <td>
                            {STATUS_LABELS[s.status]}
                            {ms?.stale && <span className="badge badge-stale">datos anteriores</span>}
                            {ms?.error && <div className="warn-text small">{ms.error}</div>}
                            {!ms && <div className="muted small">sin datos en el store</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
      </section>

      <section className="panel" aria-labelledby="revisiones">
        <h2 id="revisiones">Revisiones recientes</h2>
        {revisions.length === 0 ? (
          <p className="muted">No hay revisiones registradas en el store.</p>
        ) : (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Revisiones recientes">
            <table className="data-table text-table">
              <caption>Últimas {revisions.length} revisiones detectadas al comparar cada corrida con la anterior (valores sin redondear).</caption>
              <thead>
                <tr>
                  <th scope="col">Detectada</th>
                  <th scope="col">Serie</th>
                  <th scope="col">Período</th>
                  <th scope="col">Anterior</th>
                  <th scope="col">Nuevo</th>
                  <th scope="col">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {revisions.map((r, i) => (
                  <tr key={`${r.seriesId}-${r.period}-${i}`}>
                    <td>{formatDateTimeAR(r.detectedAt)}</td>
                    <th scope="row">{findSeries(r.seriesId)?.shortName ?? r.seriesId}</th>
                    <td>{formatPeriodShort(r.period)}</td>
                    <td>{formatNumber(r.oldValue, 2)}</td>
                    <td>{formatNumber(r.newValue, 2)}</td>
                    <td>{REV_LABELS[r.kind]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="no-disponibles-t" id="no-disponibles">
        <h2 id="no-disponibles-t">Indicadores no disponibles en la API del INDEC</h2>
        <h3>Actividad</h3>
        <ul>
          {ACTIVIDAD_NO_DISPONIBLE.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <h3>Comercio exterior</h3>
        <ul>
          {COMEX_NO_DISPONIBLE.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {pendientes.length > 0 && (
          <>
            <h3>Series del registro sin fuente en la API</h3>
            <ul>
              {pendientes.map((s) => (
                <li key={s.id}>
                  {s.name} — {STATUS_LABELS[s.status]}
                </li>
              ))}
            </ul>
          </>
        )}
        <h3>Fuentes complementarias (no implementadas)</h3>
        <ul>
          {LABORAL_COMPLEMENTARIAS.map((c) => (
            <li key={c.indicador}>
              <strong>{c.indicador}</strong> — {c.fuente}. {c.nota}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="signos">
        <h2 id="signos">Signos convencionales del INDEC</h2>
        <dl className="kv kv-compact">
          {FLAGS.map(([k, v]) => (
            <div key={k}>
              <dt>
                <code>{k}</code>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <h3>Criterios del dashboard</h3>
        <ul>
          <li>Faltante = sin dato (nunca cero). No se interpola ni se arrastran valores.</li>
          <li>Comparaciones por calendario: interanual = mismo período del año anterior.</li>
          <li>Tasas → diferencias en puntos porcentuales; saldos → diferencias absolutas; índices y flujos → variaciones %.</li>
          <li>Variación mensual/trimestral de actividad solo sobre series desestacionalizadas o tendencia-ciclo. No se desestacionaliza en forma propia.</li>
          <li>No se mezclan frecuencias, ajustes ni bases en un mismo gráfico (salvo base 100 común elegida por el usuario).</li>
          <li>EPH: 31 aglomerados urbanos, no total nacional.</li>
          <li>Comercio exterior: USD corrientes; exportaciones FOB, importaciones CIF. Valores, no volúmenes.</li>
        </ul>
      </section>
    </>
  );
}
