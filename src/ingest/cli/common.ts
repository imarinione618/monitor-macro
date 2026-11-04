/** Utilidades compartidas por los comandos de ingesta (refresh, discover, check). */
import { DATASETS } from '../../core/datasets';
import type { DatasetId } from '../../core/types';
import { IndecClient } from '../client';
import { readIngestEnv } from '../config';
import { ERROR_KIND_LABELS, IngestError, toIngestError } from '../errors';

export interface CliArgs {
  flags: Set<string>;
  values: Map<string, string[]>;
}

/** Parser mínimo: --flag, --clave valor, --clave=valor (repetibles). */
export function parseArgs(argv: string[], valued: string[], allowedFlags: string[] = []): CliArgs {
  const flags = new Set<string>();
  const values = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) throw new IngestError('config', `Argumento no reconocido: ${a}`);
    const [k, inline] = a.slice(2).split('=', 2) as [string, string | undefined];
    if (valued.includes(k)) {
      const v = inline ?? argv[++i];
      if (v === undefined) throw new IngestError('config', `Falta el valor de --${k}`);
      values.set(k, [...(values.get(k) ?? []), ...v.split(',').map((x) => x.trim()).filter(Boolean)]);
    } else if (allowedFlags.includes(k) || k === 'help') flags.add(k);
    else {
      const valid = [...allowedFlags.map((f) => `--${f}`), ...valued.map((v) => `--${v} <valor>`)].join(', ');
      throw new IngestError('config', `Opción desconocida: --${k}. Válidas: ${valid}`);
    }
  }
  return { flags, values };
}

export function parseDatasetIds(ids: string[] | undefined): DatasetId[] | undefined {
  if (!ids?.length) return undefined;
  const bad = ids.filter((d) => !(d in DATASETS));
  if (bad.length) throw new IngestError('config', `Dataset desconocido: ${bad.join(', ')}. Válidos: ${Object.keys(DATASETS).join(', ')}`);
  return ids as DatasetId[];
}

export function makeClient(opts: { useCache?: boolean; log?: (m: string) => void } = {}): IndecClient {
  const env = readIngestEnv();
  return new IndecClient({
    baseUrl: env.baseUrl,
    token: env.token,
    timeoutMs: env.timeoutMs,
    maxRetries: env.maxRetries,
    minIntervalMs: env.minIntervalMs,
    cacheDir: env.cacheDir,
    cacheTtlHours: env.cacheTtlHours,
    useCache: opts.useCache ?? true,
    log: opts.log ?? ((m) => console.log(m)),
  });
}

/** Ejecuta un comando CLI con manejo uniforme de errores y código de salida. */
export function runCli(main: () => Promise<number>): void {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      const err = toIngestError(e);
      console.error(`ERROR (${ERROR_KIND_LABELS[err.kind]}): ${err.message}`);
      process.exitCode = err.kind === 'config' ? 2 : 1;
    },
  );
}
