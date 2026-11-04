/**
 * npm run data:check [-- --dataset <id>] [--full] [--no-cache]
 *
 * Verifica contra la API que cada selector del registro identifique exactamente una
 * serie (1 fila por período), e informa inicio, fin, cantidad, nulos y huecos.
 * Los datasets por ventana (comercio exterior) se verifican sobre la ventana de
 * revisión salvo --full. Escribe el detalle en data/runs/check-<fecha>.json.
 * Código de salida ≠ 0 si hay problemas.
 */
import path from 'node:path';
import { validateRegistry } from '../../core/registry';
import { writeJsonAtomic } from '../../core/store';
import { checkRegistry, formatCheckTable } from '../check';
import { loadEnv } from '../config';
import { makeClient, parseArgs, parseDatasetIds, runCli } from './common';

runCli(async () => {
  loadEnv();
  const args = parseArgs(process.argv.slice(2), ['dataset'], ['full', 'no-cache']);
  const staticErrors = validateRegistry();
  if (staticErrors.length) {
    console.log('Errores estáticos del registro:');
    for (const e of staticErrors) console.log(`  - ${e}`);
  }
  const client = makeClient({ useCache: !args.flags.has('no-cache') });
  const report = await checkRegistry({
    client,
    full: args.flags.has('full'),
    datasets: parseDatasetIds(args.values.get('dataset')),
    log: (m) => console.log(m),
  });
  console.log('');
  console.log(formatCheckTable(report));
  const bad = report.series.filter((s) => !s.ok);
  console.log('');
  for (const d of report.datasetErrors) console.log(`Dataset con error: ${d.dataset} — ${d.message}`);
  console.log(`Series verificadas: ${report.series.length} · OK: ${report.series.length - bad.length} · con problemas: ${bad.length}`);
  const file = path.resolve('data/runs', `check-${report.checkedAt.replace(/[:.]/g, '-')}.json`);
  writeJsonAtomic(file, report);
  console.log(`Detalle: ${path.relative(process.cwd(), file)}`);
  return report.ok && !staticErrors.length ? 0 : 1;
});
