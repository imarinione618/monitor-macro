/**
 * npm run data:refresh [-- --full] [--dataset <id>[,<id>]] [--feed <id>[,<id>]] [--solo-externas] [--no-cache]
 *
 * Además de la API INDEC, actualiza las fuentes externas del registro (datos.gob.ar, IDECBA; solo dashboard).
 *
 * Descarga la API de INDEC, normaliza al store (data/store), detecta revisiones
 * y escribe el manifest. Código de salida ≠ 0 si hubo fallas (aunque sean parciales).
 */
import { loadEnv } from '../config';
import { runRefresh } from '../refresh';
import { makeClient, parseArgs, parseDatasetIds, runCli } from './common';

runCli(async () => {
  loadEnv();
  const args = parseArgs(process.argv.slice(2), ['dataset', 'feed'], ['full', 'no-cache', 'solo-externas']);
  if (args.flags.has('help')) {
    console.log('Uso: npm run data:refresh -- [--full] [--dataset <id>[,<id>...]] [--feed <id>[,<id>...]] [--solo-externas] [--no-cache]');
    return 0;
  }
  const client = makeClient({ useCache: !args.flags.has('no-cache') });
  const summary = await runRefresh({
    client,
    full: args.flags.has('full'),
    datasets: parseDatasetIds(args.values.get('dataset')),
    skipIndec: args.flags.has('solo-externas'),
    feeds: args.values.get('feed'),
  });
  console.log(`Requests HTTP: ${client.stats.requests} · reintentos: ${client.stats.retries} · páginas desde caché: ${client.stats.cacheHits}`);
  return summary.ok ? 0 : 1;
});
