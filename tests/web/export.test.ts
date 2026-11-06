import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildChartModel, buildSnapshotModel } from '@/web/lib/chartModel';
import {
  buildSubtitle,
  buildTimeSeriesOption,
  EXPORT_SIZE,
  exportSnapshotOption,
  exportTimeSeriesOption,
  SYNTHETIC_WARNING,
  type ChartTextMeta,
} from '@/web/lib/chartOptions';
import { renderSvgString } from '@/web/lib/exportRender';
import { buildSourceLine, collectNotes } from '@/web/lib/meta';
import { LIGHT_THEME } from '@/web/lib/palette';
import { fakeSeries } from './helpers';

const ipc = fakeSeries('precios.ipc.ng.nacional', '2016-12', '2026-08', (i) => 100 * 1.02 ** i);
const gba = fakeSeries('precios.ipc.ng.gba', '2016-12', '2026-08', (i) => 100 * 1.021 ** i);
const model = buildChartModel({ series: [ipc, gba], transform: 'pct_yoy', range: '5y' })!;
const meta: ChartTextMeta = {
  title: 'IPC — Nivel general por región',
  subtitle: buildSubtitle(model),
  source: buildSourceLine([ipc, gba], 'pct_yoy'),
  notes: collectNotes([ipc, gba]),
  synthetic: true,
};
const colorSlots = { [ipc.def.id]: 0, [gba.def.id]: 1 };

type Opt = Record<string, unknown> & {
  title?: { text: string; subtext: string }[];
  graphic?: { style: { text: string } }[];
  backgroundColor?: string;
};

/** Cada atributo entre comillas dobles debe cerrarse antes de un espacio, ">" o "/" (SVG válido para PowerPoint). */
function expectWellFormedAttributes(svg: string): void {
  const bad = svg.match(/\s[a-zA-Z:-]+="[^"]*"(?![\s>/])/g) ?? [];
  expect(bad).toEqual([]);
}

describe('opciones de exportación', () => {
  const opt = exportTimeSeriesOption({ model, kind: 'line', colorSlots, meta }) as Opt;

  it('fondo blanco, sin animación y sin controles interactivos', () => {
    expect(opt.backgroundColor).toBe('#ffffff');
    expect(opt.animation).toBe(false);
    expect(opt.tooltip).toBeUndefined();
    expect(opt.toolbox).toBeUndefined();
    expect(opt.dataZoom).toBeUndefined();
  });

  it('título, subtítulo con transformación, unidad y período', () => {
    expect(opt.title?.[0]?.text).toBe(meta.title);
    expect(opt.title?.[0]?.subtext).toContain('Var. % interanual');
    expect(opt.title?.[0]?.subtext).toContain('Unidad: %');
    expect(opt.title?.[0]?.subtext).toMatch(/sep-21 a ago-26/);
  });

  it('fuente al pie (y aviso de datos sintéticos)', () => {
    const foot = opt.graphic?.[0]?.style.text ?? '';
    expect(foot).toContain('Fuente: one618 en base a INDEC.');
    expect(foot).toContain(SYNTHETIC_WARNING);
  });

  it('la opción de pantalla no lleva título (lo pone el HTML) y sí tooltip', () => {
    const scr = buildTimeSeriesOption({ model, kind: 'line', colorSlots, mode: 'screen', theme: LIGHT_THEME }) as Opt;
    expect(scr.title).toBeUndefined();
    expect(scr.tooltip).toBeDefined();
  });

  it('render SSR a SVG 1600×900 con título, unidad y fuente', () => {
    const svg = renderSvgString(opt as never);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(`width="${EXPORT_SIZE.width}"`);
    expect(svg).toContain(`height="${EXPORT_SIZE.height}"`);
    expect(svg).toMatch(/IPC — Nivel general por región/);
    expect(svg).toMatch(/Unidad: %/);
    expect(svg).toMatch(/Fuente: one618 en base a INDEC/);
    expect(svg).toMatch(/#ffffff|#fff\b|rgb\(255,\s*255,\s*255\)/i);
    expect(svg).toMatch(/IPC nacional/); // leyenda
    expectWellFormedAttributes(svg);
    const dir = process.env.EXPORT_SAMPLE_DIR;
    if (dir) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'export-ejemplo-lineas.svg'), svg, 'utf8');
    }
  });

  it('barras apiladas y barras horizontales (corte) también exportan', () => {
    const r = ['comex.expo.rubro.pp', 'comex.expo.rubro.moa', 'comex.expo.rubro.moi'].map((id, k) =>
      fakeSeries(id, '2023-01', '2025-12', (i) => 1000 + 100 * k + i),
    );
    const m = buildChartModel({ series: r, transform: 'level', range: '24m' })!;
    const o = exportTimeSeriesOption({
      model: m,
      kind: 'stacked',
      colorSlots: { [r[0]!.def.id]: 0, [r[1]!.def.id]: 1, [r[2]!.def.id]: 2 },
      meta: { title: 'Exportaciones por grandes rubros', subtitle: buildSubtitle(m), source: buildSourceLine(r, 'level') },
    });
    const svg = renderSvgString(o);
    expect(svg).toMatch(/Exportaciones por grandes rubros/);
    expect(svg).toMatch(/Millones de USD/);

    const sectors = ['actividad.emae_sector.agro.orig', 'actividad.emae_sector.pesca.orig', 'actividad.emae.total.orig'].map((id, k) =>
      fakeSeries(id, '2024-01', '2025-06', (i) => 100 + (k + 1) * i),
    );
    const snap = buildSnapshotModel(sectors, 'pct_yoy', null, 'actividad.emae.total.orig')!;
    const so = exportSnapshotOption({
      snap,
      meta: { title: 'EMAE por sectores — último mes', subtitle: `${snap.transformLabel} · Unidad: ${snap.unit}`, source: 'Fuente: one618 en base a INDEC.' },
    });
    const ssvg = renderSvgString(so);
    expect(ssvg).toMatch(/EMAE por sectores/);
    expect(ssvg).toMatch(/Fuente: one618 en base a INDEC/);
    expectWellFormedAttributes(svg);
    expectWellFormedAttributes(ssvg);
    const dir = process.env.EXPORT_SAMPLE_DIR;
    if (dir) {
      fs.writeFileSync(path.join(dir, 'export-ejemplo-apiladas.svg'), svg, 'utf8');
      fs.writeFileSync(path.join(dir, 'export-ejemplo-corte.svg'), ssvg, 'utf8');
    }
  });
});
