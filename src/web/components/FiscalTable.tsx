'use client';

import { useId, useMemo, useState } from 'react';
import { formatPeriodLong } from '@/core/periods';
import { applyTransform } from '@/core/transforms';
import type { Observation, Period } from '@/core/types';
import { CSV_BOM, CSV_SEP, csvNumber } from '@/web/lib/csv';
import { downloadBlob } from '@/web/lib/exportRender';
import { formatNumber } from '@/web/lib/format';
import type { ClientSeries } from '@/web/lib/types';
import { SourceFooter } from './ChartParts';
import { Segmented, Select } from './controls';

interface Props {
  title: string;
  description?: string;
  /** [id nominal, sangría] en orden de presentación. */
  rows: [string, number][];
  pool: ClientSeries[];
  realOf: Record<string, string>;
  realLabel: string | null;
  source: string;
}

type Mode = 'mes' | 'acumulado';

function valueAt(obs: Observation[], frequency: 'M', t: Parameters<typeof applyTransform>[2], p: Period): number | null {
  return applyTransform(obs, frequency, t).find((x) => x.period === p)?.value ?? null;
}

/** Cuadro fiscal: nivel nominal y real, var. i.a. nominal y real; resultados: diferencia i.a. a precios de hoy. */
export function FiscalTable({ title, description, rows, pool, realOf, realLabel, source }: Props) {
  const uid = useId();
  const byId = useMemo(() => new Map(pool.map((s) => [s.def.id, s])), [pool]);
  const periods = useMemo(() => {
    const ref = byId.get('fiscal.resultado.primario') ?? byId.get(rows[0]![0]);
    return (ref?.observations.filter((o) => o.value !== null).map((o) => o.period) ?? []).reverse();
  }, [byId, rows]);
  const [period, setPeriod] = useState<Period>(periods[0] ?? '');
  const [mode, setMode] = useState<Mode>('mes');

  const table = useMemo(() => rows.flatMap(([id, indent]) => {
    const s = byId.get(id);
    if (!s) return [];
    const real = byId.get(realOf[id] ?? '');
    const balance = s.def.measure === 'balance';
    const levelT = mode === 'mes' ? 'level' : 'ytd_sum';
    const pctT = mode === 'mes' ? 'pct_yoy' : 'ytd_sum_pct_yoy';
    const nominal = valueAt(s.observations, 'M', levelT, period);
    const realLevel = real ? valueAt(real.observations, 'M', levelT, period) : null;
    const nominalPct = balance ? null : valueAt(s.observations, 'M', pctT, period);
    const realPct = balance || !real ? null : valueAt(real.observations, 'M', pctT, period);
    let realDiff: number | null = null;
    if (balance && real) {
      const base = mode === 'mes' ? real.observations : applyTransform(real.observations, 'M', 'ytd_sum').map((p) => ({ period: p.period, value: p.value }));
      realDiff = valueAt(base, 'M', 'diff_yoy_abs', period);
    }
    return [{ id, indent, name: s.def.shortName === s.def.name ? s.def.name : s.def.name, balance, nominal, realLevel, nominalPct, realPct, realDiff }];
  }), [rows, byId, realOf, period, mode]);

  const realCol = realLabel ? `Millones de $ de ${realLabel}` : 'Millones de $ constantes';
  const periodLabel = mode === 'mes' ? formatPeriodLong(period) : `enero a ${formatPeriodLong(period)}`;

  const csv = () => {
    const head = ['partida', 'millones de $ corrientes', realCol.toLowerCase(), 'var. i.a. nominal (%)', 'var. i.a. real (%)', `dif. i.a. real (${realCol.toLowerCase()})`];
    const lines = table.map((r) => [r.name, csvNumber(r.nominal), csvNumber(r.realLevel), csvNumber(r.nominalPct), csvNumber(r.realPct), csvNumber(r.realDiff)].map((x) => (/[";\r\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)).join(CSV_SEP));
    downloadBlob(CSV_BOM + [`${title} — ${periodLabel}`, head.join(CSV_SEP), ...lines].join('\r\n') + '\r\n', 'text/csv;charset=utf-8', `cuadro-fiscal-${period}-${mode}.csv`);
  };

  const pctCell = (v: number | null) => <td className={v === null ? 'muted' : v > 0 ? 'pos' : v < 0 ? 'neg' : undefined}>{v === null ? '—' : `${formatNumber(v, 1, { signed: true })} %`}</td>;

  return (
    <section className="panel fiscal-table" aria-labelledby={`${uid}-t`}>
      <header className="panel-head">
        <h2 id={`${uid}-t`}>{title}</h2>
        {description && <p className="panel-desc">{description}</p>}
      </header>
      <div className="controls">
        <Select label="Mes" value={period} options={periods.map((p) => ({ value: p, label: formatPeriodLong(p) }))} onChange={setPeriod} />
        <Segmented label="Período" value={mode} options={[{ value: 'mes', label: 'Mes' }, { value: 'acumulado', label: 'Acumulado del año' }]} onChange={setMode} />
        <button type="button" className="btn" onClick={csv} disabled={!table.length}>CSV</button>
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={`Tabla: ${title}`}>
        <table className="data-table fiscal">
          <caption>{title} — {periodLabel}. Resultados: diferencia interanual a precios de {realLabel ?? 'hoy'}.</caption>
          <thead>
            <tr><th scope="col">Partida</th><th scope="col">Millones de $ corrientes</th><th scope="col">{realCol}</th><th scope="col">Var. i.a. nominal</th><th scope="col">Var. i.a. real</th></tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.id} className={`indent-${r.indent}`}>
                <th scope="row" style={{ paddingLeft: `${0.6 + r.indent * 1.1}rem`, fontWeight: r.indent === 0 ? 700 : r.indent === 1 ? 600 : 400 }}>{r.name}</th>
                <td>{formatNumber(r.nominal, 0)}</td>
                <td>{formatNumber(r.realLevel, 0)}</td>
                {r.balance ? (
                  <td colSpan={2} className={r.realDiff === null ? 'muted' : r.realDiff > 0 ? 'pos' : 'neg'}>
                    {r.realDiff === null ? '—' : `${formatNumber(r.realDiff, 0, { signed: true })} M$ de ${realLabel ?? 'hoy'} (dif. i.a.)`}
                  </td>
                ) : (
                  <>
                    {pctCell(r.nominalPct)}
                    {pctCell(r.realPct)}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SourceFooter source={source} />
    </section>
  );
}
