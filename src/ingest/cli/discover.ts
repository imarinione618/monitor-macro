/**
 * npm run data:discover [-- --dataset <id>] [--no-cache]
 *
 * Releva las dimensiones reales de cada endpoint y escribe docs/catalogo-dimensiones.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Row } from '../client';
import { loadEnv } from '../config';
import { discoverAll, renderCatalog } from '../discover';
import { makeClient, parseArgs, parseDatasetIds, runCli } from './common';
import { DATASETS } from '../../core/datasets';

runCli(async () => {
  loadEnv();
  const args = parseArgs(process.argv.slice(2), ['dataset'], ['no-cache']);
  const client = makeClient({ useCache: !args.flags.has('no-cache') });
  const ids = parseDatasetIds(args.values.get('dataset'));
  console.log('Relevando dimensiones de la API de INDEC…');
  const items = await discoverAll(client, ids, (m) => console.log(m));
  let nomen: Record<string, Record<string, string>> | null = null;
  try {
    const ds = DATASETS.comercio_exterior_nomenclaturas;
    const res = await client.fetchAll(ds.path, {}, ds.primaryKey);
    nomen = {};
    for (const r of res.rows as Row[]) (nomen[String(r.nombre_columna)] ??= {})[String(r.codigo)] = String(r.codigo_descripcion ?? '');
  } catch (e) {
    console.log(`Aviso: sin nomenclaturas (${(e as Error).message})`);
  }
  const file = path.resolve('docs/catalogo-dimensiones.md');
  fs.writeFileSync(file, renderCatalog(items, nomen, new Date().toISOString().slice(0, 10)), 'utf8');
  console.log(`Escrito ${path.relative(process.cwd(), file)} (${items.length} endpoints)`);
  return items.some((i) => i.error) ? 1 : 0;
});
