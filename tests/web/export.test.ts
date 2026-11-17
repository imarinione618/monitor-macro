import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { buildChartModel, buildSnapshotModel } from '@/web/lib/chartModel';
import { EXPORT_PIXEL_RATIO, pt, setPngDpi } from '@/web/lib/exportStyle';
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

  it('formato de descarga: 12,7 × 7,62 cm, Arial, título 12 pt, subtítulo 10 pt, resto 7 pt, centrado y sin grilla', () => {
    expect(EXPORT_SIZE).toEqual({ width: 480, height: 288 }); // 5 × 3 pulgadas a 96 px/pulg.
    expect(Math.round(EXPORT_SIZE.width * EXPORT_PIXEL_RATIO)).toBe(1500); // PNG a 300 dpi
    const t = (opt.title as unknown as Record<string, any>[])[0]!;
    expect(t.left).toBe(EXPORT_SIZE.width / 2);
    expect(t.textAlign).toBe('center');
    expect(t.textStyle.fontSize).toBeCloseTo(pt(12));
    expect(t.subtextStyle.fontSize).toBeCloseTo(pt(10));
    expect(t.textStyle.fontFamily).toMatch(/^Arial/);
    const o = opt as Record<string, any>;
    expect(o.textStyle.fontFamily).toMatch(/^Arial/);
    expect(o.textStyle.fontSize).toBeCloseTo(pt(7));
    expect(o.xAxis.axisLabel.fontSize).toBeCloseTo(pt(7));
    expect(o.legend.textStyle.fontSize).toBeCloseTo(pt(7));
    expect(o.yAxis.splitLine.show).toBe(false);
    const svg = renderSvgString(opt as never);
    expect(svg).toMatch(/font-family:Arial/);
    expect(svg).not.toMatch(/Segoe UI/);
  });

  it('PNG con 300 dpi grabados (chunk pHYs válido)', async () => {
    // PNG mínimo 1×1 (firma + IHDR + IDAT + IEND).
    const png = Uint8Array.from(
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
    );
    const out = setPngDpi(png, 300);
    const buf = Buffer.from(out);
    const i = buf.indexOf('pHYs');
    expect(i).toBe(37); // inmediatamente después de IHDR
    expect(buf.readUInt32BE(i + 4)).toBe(11811); // 300 dpi = 11811 px/m
    expect(buf.readUInt32BE(i + 8)).toBe(11811);
    expect(buf[i + 12]).toBe(1);
    // Un decodificador real (libpng vía sharp) acepta el archivo y lee 300 dpi.
    const meta = await sharp(buf).metadata();
    expect(meta.density).toBe(300);
    // Idempotente: no duplica el chunk.
    const again = Buffer.from(setPngDpi(out, 300));
    expect(again.length).toBe(buf.length);
    expect(again.indexOf('pHYs', i + 1)).toBe(-1);
  });

  it('render SSR a SVG 12,7 × 7,62 cm con título, unidad y fuente', () => {
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
