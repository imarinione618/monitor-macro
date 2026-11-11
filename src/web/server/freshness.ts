/**
 * Frescura por fuente — SOLO SERVIDOR/CLI (lee manifests con node:fs).
 *
 * Cada fuente se actualiza por separado (INDEC, datos.gob.ar e IDECBA en data:refresh;
 * BCRA y A3 en monetary:refresh; Secretaría de Energía en combustibles:refresh), así
 * que una caída de una no debe ocultar que las otras están al día.
 *
 * Fecha informada = la última consulta exitosa a la fuente (la más reciente entre sus
 * componentes: datasets, feeds o series). No se usa la más antigua porque hay componentes
 * que se bajan con menor frecuencia a propósito (p. ej. EESS Res. 1104, cada 7 días).
 * `ok = false` si algún componente falló en su último intento: se muestra con aviso y
 * el dato de ese componente es el conservado de la consulta anterior.
 * Solo cuentan los feeds usados por alguna serie del registro.
 * Imports relativos: también lo usa scripts/check-freshness.ts fuera de Next.
 */
import { readFuelManifest } from '../../combustibles/store';
import { FEEDS } from '../../core/feeds';
import { requiredDatasets, SERIES } from '../../core/registry';
import { readManifest, storeDir } from '../../core/store';
import { readMonetaryManifest } from '../../monetary/store';

export interface SourceFreshness {
  key: 'indec' | 'datosgob' | 'idecba' | 'bcra' | 'a3' | 'energia';
  label: string;
  /** Última consulta exitosa a la fuente (ISO) o null si no hay datos. */
  updatedAt: string | null;
  /** false si algún componente falló en su último intento. */
  ok: boolean;
  /** Componentes con falla (nombres técnicos, para avisos). */
  failed: string[];
  /** Cantidad de componentes considerados. */
  total: number;
}

interface Part { name: string; at: string | null; ok: boolean }

function summarize(key: SourceFreshness['key'], label: string, parts: Part[]): SourceFreshness | null {
  if (!parts.length) return null;
  const dates = parts.map((p) => p.at).filter((x): x is string => !!x).sort();
  const failed = parts.filter((p) => !p.ok || !p.at).map((p) => p.name);
  return { key, label, updatedAt: dates[dates.length - 1] ?? null, ok: failed.length === 0, failed, total: parts.length };
}

function safe<T>(fn: () => T): T | null {
  try { return fn(); } catch { return null; }
}

export function getSourceFreshness(): SourceFreshness[] {
  const out: (SourceFreshness | null)[] = [];

  const m = safe(() => readManifest(storeDir()));
  if (m) {
    out.push(summarize('indec', 'INDEC', requiredDatasets().map((id) => {
      const st = m.datasets[id];
      return { name: id, at: st?.lastSuccessAt ?? null, ok: !!st?.ok };
    })));
    const used = new Set(SERIES.flatMap((s) => (s.source.kind === 'external' ? [s.source.feed] : [])));
    const feeds = Object.values(FEEDS).filter((f) => used.has(f.id));
    const feedPart = (id: string): Part => {
      const st = m.feeds?.[id];
      return { name: id, at: st?.lastSuccessAt ?? null, ok: !!st?.ok };
    };
    out.push(summarize('datosgob', 'datos.gob.ar', feeds.filter((f) => f.kind === 'sspm_csv').map((f) => feedPart(f.id))));
    out.push(summarize('idecba', 'IDECBA', feeds.filter((f) => f.kind.startsWith('idecba')).map((f) => feedPart(f.id))));
  }

  const mon = safe(() => readMonetaryManifest());
  if (mon) {
    const entries = Object.entries(mon.series);
    const part = ([id, s]: [string, { retrievedAt: string; stale: boolean }]): Part => ({ name: id, at: s.retrievedAt || null, ok: !s.stale });
    out.push(summarize('bcra', 'BCRA', entries.filter(([id]) => id.startsWith('monetario.bcra.')).map(part)));
    out.push(summarize('a3', 'A3 Mercados', entries.filter(([id]) => id.startsWith('monetario.a3.')).map(part)));
  }

  const fuel = safe(() => readFuelManifest());
  if (fuel) {
    out.push(summarize('energia', 'Combustibles', Object.entries(fuel.series).map(([id, s]) => ({ name: id, at: s.retrievedAt || null, ok: !s.stale }))));
  }

  return out.filter((x): x is SourceFreshness => !!x);
}
