import Link from 'next/link';
import type { TransformId } from '@/core/types';
import { formatDateTimeAR, formatWithUnit } from '@/web/lib/format';
import { computeKpi, sparklinePath } from '@/web/lib/kpi';
import type { ClientSeries } from '@/web/lib/types';

interface KpiCardProps {
  series: ClientSeries;
  transform: TransformId;
  compare?: TransformId;
  href?: string;
  title?: string;
}

/** Tarjeta KPI (componente de servidor): valor, unidad, período propio, comparación y sparkline. */
export function KpiCard({ series, transform, compare, href, title }: KpiCardProps) {
  const { def } = series;
  const k = computeKpi(def, series.observations, transform, compare);
  const signed = transform !== 'level';
  const name = title ?? def.name;
  const sp = sparklinePath(
    k.spark.map((p) => p.value),
    120,
    36,
  );
  const body = (
    <>
      <div className="kpi-top">
        <h3 className="kpi-name">{name}</h3>
        {series.stale && (
          <span className="badge badge-stale" title="La última actualización falló; se muestran datos conservados de una corrida anterior.">
            datos anteriores
          </span>
        )}
      </div>
      {series.missing ? (
        <p className="kpi-empty">Sin datos en el store</p>
      ) : (
        <>
          <p className="kpi-value">
            {formatWithUnit(k.value, k.unit, { signed })}
          </p>
          <p className="kpi-label">
            {k.label} · <strong>{k.periodLabel}</strong>
          </p>
          {k.compare && (
            <p className="kpi-compare">
              {k.compare.label}: <strong>{formatWithUnit(k.compare.value, k.compare.unit, { signed: k.compare.signed })}</strong>
            </p>
          )}
          {sp.d && (
            <svg className="kpi-spark" viewBox="0 0 120 36" preserveAspectRatio="none" role="img" aria-label={`Evolución reciente: ${k.label}, ${k.spark.length} períodos`}>
              {sp.zeroY !== null && <line x1="0" x2="120" y1={sp.zeroY} y2={sp.zeroY} className="spark-zero" vectorEffect="non-scaling-stroke" />}
              <path d={sp.d} className="spark-line" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          {series.error && <p className="kpi-note warn-text">Última actualización con error: {series.error}</p>}
          {k.lagged && k.lastObservedPeriod && <p className="kpi-note">El último período publicado no tiene dato para esta medida.</p>}
        </>
      )}
      <p className="kpi-foot">
        <span>{def.unit}</span>
        <span>Consultado: {formatDateTimeAR(series.retrievedAt)}</span>
      </p>
    </>
  );
  return (
    <article className={`kpi${series.stale ? ' is-stale' : ''}`}>
      {href ? (
        <Link href={href} className="kpi-link" aria-label={`${name}: ver detalle`}>
          {body}
        </Link>
      ) : (
        body
      )}
    </article>
  );
}
