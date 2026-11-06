/**
 * Lectura de CSV en streaming (los archivos de la Secretaría de Energía pesan hasta ~800 MB y el
 * servidor ignora Range): se procesa línea a línea sin guardar el archivo.
 */

/** Divide una línea CSV (RFC 4180: comillas dobles, "" escapado). No admite saltos de línea dentro de campos. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Divide un flujo de texto en líneas (\n o \r\n), quitando el BOM inicial. */
export async function* splitLines(chunks: AsyncIterable<string>): AsyncGenerator<string> {
  let buffer = '';
  let first = true;
  for await (const chunk of chunks) {
    buffer += chunk;
    if (first && buffer.length) { buffer = buffer.replace(/^﻿/, ''); first = false; }
    let start = 0;
    let idx: number;
    while ((idx = buffer.indexOf('\n', start)) !== -1) {
      const end = idx > start && buffer[idx - 1] === '\r' ? idx - 1 : idx;
      yield buffer.slice(start, end);
      start = idx + 1;
    }
    buffer = buffer.slice(start);
  }
  if (first) buffer = buffer.replace(/^﻿/, '');
  if (buffer.length) yield buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
}

export type LineReader = (url: string) => AsyncIterable<string>;

export interface HttpOptions { fetch?: typeof fetch; timeoutMs?: number }

/** Descarga en streaming y devuelve líneas. Errores HTTP → excepción con el código (sin volcar el cuerpo). */
export function httpLines(options: HttpOptions = {}): LineReader {
  return async function* (url: string) {
    const response = await (options.fetch ?? fetch)(url, { headers: { Accept: 'text/csv,*/*' }, signal: AbortSignal.timeout(options.timeoutMs ?? 20 * 60_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status} al descargar ${new URL(url).pathname.split('/').pop()}`);
    if (!response.body) throw new Error('Respuesta sin cuerpo');
    const decoded = response.body.pipeThrough(new TextDecoderStream('utf-8'));
    yield* splitLines(decoded as unknown as AsyncIterable<string>);
  };
}

/** Itera filas como objetos parciales indexados por las columnas pedidas; valida que existan. */
export interface CsvRows {
  header: string[];
  index: Record<string, number>;
  rows: AsyncGenerator<string[]>;
}

export async function readCsv(lines: AsyncIterable<string>, required: string[], label: string): Promise<CsvRows> {
  const iterator = lines[Symbol.asyncIterator]();
  let first = await iterator.next();
  while (!first.done && !first.value.trim()) first = await iterator.next();
  if (first.done) throw new Error(`${label}: archivo vacío`);
  const header = parseCsvLine(first.value.replace(/^﻿/, '')).map(h => h.trim());
  const index: Record<string, number> = {};
  header.forEach((h, i) => { index[h] = i; });
  const missing = required.filter(c => index[c] === undefined);
  if (missing.length) throw new Error(`${label}: cambió el esquema (faltan columnas ${missing.join(', ')})`);
  async function* rows(): AsyncGenerator<string[]> {
    for (;;) {
      const next = await iterator.next();
      if (next.done) return;
      if (!next.value) continue;
      yield parseCsvLine(next.value);
    }
  }
  return { header, index, rows: rows() };
}

/** Número decimal con punto; cualquier otra cosa → null (nunca 0). */
export function parseDecimal(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
