'use client';

import { useState } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { downloadBlob, downloadUrl, renderPngDataUrl, renderSvgString } from '@/web/lib/exportRender';
import { slugify } from '@/web/lib/format';
import type { SeriesNotice } from '@/web/lib/meta';
import type { SourceRef } from '@/web/lib/types';

function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

interface ToolbarProps {
  title: string;
  showTable: boolean;
  onToggleTable: () => void;
  tableId: string;
  getCsv: () => string;
  getExportOption: () => EChartsCoreOption | null;
  disabled?: boolean;
}

/** Tabla, CSV, PNG y SVG. La exportación renderiza una instancia aparte (1600×900, fondo blanco). */
export function ChartToolbar({ title, showTable, onToggleTable, tableId, getCsv, getExportOption, disabled }: ToolbarProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const base = `${slugify(title)}-${stamp()}`;

  const run = (kind: 'csv' | 'png' | 'svg') => {
    setErr(null);
    setBusy(kind);
    // Dejar que el navegador pinte el estado "generando" antes del render.
    setTimeout(() => {
      try {
        if (kind === 'csv') downloadBlob(getCsv(), 'text/csv;charset=utf-8', `${base}.csv`);
        else {
          const opt = getExportOption();
          if (!opt) throw new Error('No hay datos para exportar.');
          if (kind === 'svg') downloadBlob(renderSvgString(opt), 'image/svg+xml;charset=utf-8', `${base}.svg`);
          else downloadUrl(renderPngDataUrl(opt), `${base}.png`);
        }
      } catch (e) {
        setErr(`No se pudo exportar: ${(e as Error).message}`);
      } finally {
        setBusy(null);
      }
    }, 10);
  };

  return (
    <div className="toolbar" role="group" aria-label={`Acciones del gráfico ${title}`}>
      <button type="button" className="btn" aria-expanded={showTable} aria-controls={tableId} onClick={onToggleTable}>
        {showTable ? 'Ocultar tabla' : 'Ver tabla'}
      </button>
      <button type="button" className="btn" onClick={() => run('csv')} disabled={disabled || !!busy}>
        {busy === 'csv' ? 'Generando…' : 'CSV'}
      </button>
      <button type="button" className="btn" onClick={() => run('png')} disabled={disabled || !!busy} title="Imagen PNG 4800×2700 px para presentaciones">
        {busy === 'png' ? 'Generando…' : 'PNG'}
      </button>
      <button type="button" className="btn" onClick={() => run('svg')} disabled={disabled || !!busy} title="Imagen vectorial SVG 1600×900">
        {busy === 'svg' ? 'Generando…' : 'SVG'}
      </button>
      {err && (
        <span className="toolbar-err" role="alert">
          {err}
        </span>
      )}
    </div>
  );
}

export function Notices({ notices }: { notices: SeriesNotice[] }) {
  if (!notices.length) return null;
  return (
    <ul className="notices">
      {notices.map((n, i) => (
        <li key={i} className={`notice notice-${n.kind}`}>
          <span className="notice-tag">{n.kind === 'stale' ? 'Datos anteriores' : n.kind === 'missing' ? 'Sin datos' : n.kind === 'error' ? 'Error' : 'Supresión'}</span> {n.text}
        </li>
      ))}
    </ul>
  );
}

export function SourceFooter({ source, sources, notes }: { source: string; sources: SourceRef[]; notes: string[] }) {
  const links = sources.filter((s) => s.methodologyUrl);
  return (
    <footer className="chart-foot">
      <p className="chart-source">{source}</p>
      {links.length > 0 && (
        <p className="chart-method">
          Metodología:{' '}
          {links.map((s, i) => (
            <span key={s.title}>
              {i > 0 && ' · '}
              <a href={s.methodologyUrl} target="_blank" rel="noopener noreferrer">
                {s.title}
              </a>
            </span>
          ))}
        </p>
      )}
      {notes.length > 0 && (
        <div className="chart-notes">
          <p className="chart-notes-title">Notas metodológicas</p>
          <ul>
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </footer>
  );
}
