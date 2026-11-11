/**
 * Formateo para la UI en español (Argentina): coma decimal, punto de miles.
 * El redondeo es SOLO de presentación; los datos almacenados y el CSV no se redondean.
 */

const nfCache = new Map<string, Intl.NumberFormat>();

function nf(decimals: number, signed: boolean): Intl.NumberFormat {
  const key = `${decimals}|${signed}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      signDisplay: signed ? 'exceptZero' : 'auto',
      useGrouping: true,
    });
    nfCache.set(key, f);
  }
  return f;
}

/** Normaliza "-0" y signos: Intl puede devolver "-0,0" para valores muy chicos negativos. */
function clean(s: string): string {
  return s.replace(/^[-−]0(,0+)?$/, (m) => m.slice(1)).replace(/^\+0(,0+)?$/, (m) => m.slice(1));
}

/** Formato numérico es-AR. null / NaN → "s/d". */
export function formatNumber(v: number | null | undefined, decimals = 1, opts: { signed?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 's/d';
  return clean(nf(decimals, !!opts.signed).format(v));
}

/** Cantidad de decimales de presentación según la unidad. */
export function decimalsForUnit(unit: string): number {
  const u = unit.toLowerCase();
  if (u === '%' || u === 'p.p.') return 1;
  if (u.includes('millones de usd')) return 0;
  if (u.includes('pesos')) return 0;
  if (u.includes('índice') || u.includes('indice')) return 1;
  return 1;
}

/** Sufijo corto de unidad para mostrar junto al número. */
export function unitSuffix(unit: string): string {
  const u = unit.toLowerCase();
  if (u === '%') return '%';
  if (u === 'p.p.') return 'p.p.';
  if (u.includes('millones de usd')) return 'M USD';
  if (u.includes('pesos')) return '$';
  return '';
}

/**
 * Valor con unidad abreviada: "4,2 %", "-0,3 p.p.", "1.234 M USD", "$ 345.678", "152,3".
 * Los índices se muestran sin sufijo (la unidad completa se informa aparte).
 */
export function formatWithUnit(v: number | null | undefined, unit: string, opts: { signed?: boolean; decimals?: number } = {}): string {
  const d = opts.decimals ?? decimalsForUnit(unit);
  const s = formatNumber(v, d, { signed: opts.signed });
  if (s === 's/d') return s;
  const suf = unitSuffix(unit);
  if (suf === '$') return `$ ${s}`;
  return suf ? `${s} ${suf}` : s;
}

/** Etiqueta compacta para ejes: 1.234 / 12,5 / 1,2 mil. */
export function formatAxis(v: number): string {
  const abs = Math.abs(v);
  // Solo se abrevian valores muy grandes (p.ej. pesos); "mil" se evita porque con
  // "Millones de USD" se confundiría con "miles de millones".
  if (abs >= 10_000_000) return `${formatNumber(v / 1_000_000, abs >= 100_000_000 ? 0 : 1)} M`;
  const d = Number.isInteger(v) || abs >= 100 ? 0 : abs < 1 ? 2 : 1;
  return formatNumber(v, d);
}

const BA_TZ = 'America/Argentina/Buenos_Aires';

/** "04/11/2026 10:02" en hora de Buenos Aires. */
export function formatDateTimeAR(iso: string | null | undefined): string {
  if (!iso) return 's/d';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 's/d';
  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: BA_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** "04/11/2026" en hora de Buenos Aires. */
export function formatDateAR(iso: string | null | undefined): string {
  return formatDateTimeAR(iso).split(' ')[0] ?? 's/d';
}

/** "04/11 12:00" en hora de Buenos Aires (sin año, para espacios chicos). */
export function formatShortDateTimeAR(iso: string | null | undefined): string {
  const full = formatDateTimeAR(iso);
  return full === 's/d' ? full : full.replace(/^(\d{2}\/\d{2})\/\d{4}/, '$1');
}

/** Slug para nombres de archivo. */
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
