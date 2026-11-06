/**
 * npm run sheets:sync [-- opciones]
 *
 *   --dry-run            No toca Google: vista previa en data/sheets-preview/<tema>/
 *   --allow-synthetic    Permite sincronizar datos SINTÉTICOS a documentos reales
 *   --topic=a,b          Solo esos temas (actividad, laboral, precios, comex)
 *
 * Sin credenciales de Google configuradas, cae automáticamente en --dry-run.
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOPIC_LABELS, type Topic } from '../../core/types';
import { credentialStatus, getAuthClient, readAuthConfig, serviceAccountEmail } from '../auth';
import { createGoogleSheetsApi, sanitizeError } from '../client';
import { envKey, localConfigPath, resolveSpreadsheetId, saveLocalConfigEntry, TOPICS } from '../config';
import { previewTopic } from '../preview';
import { isSyntheticSource, loadStoreSource } from '../source';
import { createTopicSpreadsheet, syncTopic } from '../writer';
import { sheetsSeriesByTopic } from '../../core/registry';

interface Args {
  dryRun: boolean;
  allowSynthetic: boolean;
  topics: Topic[];
  help: boolean;
}

export function parseArgs(argv: string[]): Args {
  const a: Args = { dryRun: false, allowSynthetic: false, topics: [...TOPICS], help: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]!;
    if (x === '--dry-run') a.dryRun = true;
    else if (x === '--allow-synthetic') a.allowSynthetic = true;
    else if (x === '--help' || x === '-h') a.help = true;
    else if (x.startsWith('--topic')) {
      const v = x.includes('=') ? x.split('=')[1]! : argv[++i] ?? '';
      const list = v.split(',').map((s) => s.trim()).filter(Boolean);
      const bad = list.filter((t) => !TOPICS.includes(t as Topic));
      if (bad.length) throw new Error(`Tema desconocido: ${bad.join(', ')}. Válidos: ${TOPICS.join(', ')}`);
      a.topics = list as Topic[];
    } else throw new Error(`Opción desconocida: ${x}`);
  }
  return a;
}

const rel = (p: string) => path.relative(process.cwd(), p).replace(/\\/g, '/');

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Uso: npm run sheets:sync -- [--dry-run] [--allow-synthetic] [--topic=actividad,precios]');
    return 0;
  }
  const cfg = readAuthConfig();
  const status = credentialStatus(cfg);
  let dryRun = args.dryRun;
  if (!dryRun && !status.ok && status.partial) {
    console.error(`Credenciales de Google incompletas (${cfg.mode}): ${status.reason}.`);
    console.error('Completá ese paso (ver docs/google-sheets.md) o usá `npm run sheets:sync -- --dry-run` para la vista previa local.');
    return 1;
  }
  if (!dryRun && !status.ok) {
    console.warn(`Sin credenciales de Google (${cfg.mode}): ${status.reason}.`);
    console.warn('→ Modo automático: vista previa local (--dry-run). Ver docs/google-sheets.md.');
    dryRun = true;
  }

  const source = loadStoreSource();
  const allIds = args.topics.flatMap((t) => sheetsSeriesByTopic(t).map((s) => s.id));
  const synthetic = isSyntheticSource(source, allIds);
  console.log(`Store: ${source.label} — modo de datos: ${synthetic ? 'SINTÉTICO (no son datos reales)' : (source.manifest?.dataMode ?? '?')}`);

  if (dryRun) {
    const outDir = path.resolve(process.env.SHEETS_PREVIEW_DIR?.trim() || 'data/sheets-preview');
    for (const topic of args.topics) {
      const { dir, files, result } = await previewTopic(topic, source, { outDir });
      console.log(
        `[dry-run] ${result.plan.title}: ${result.tabsCreated.length} pestañas, ${result.cellsWritten} celdas, ` +
          `${result.apiCalls.batchUpdate} batchUpdate + ${result.apiCalls.valuesBatchUpdate} values.batchUpdate → ${rel(dir)}/ (${files.length} archivos)`,
      );
      for (const w of result.warnings) console.warn(`  aviso: ${w}`);
    }
    if (synthetic) console.warn('Atención: la vista previa contiene DATOS SINTÉTICOS (marcados en LEEME y CONTROL).');
    return 0;
  }

  if (synthetic && !args.allowSynthetic) {
    console.error(
      'El store contiene DATOS SINTÉTICOS. No se sincronizan a documentos reales salvo con --allow-synthetic ' +
        '(quedarían marcados en LEEME y CONTROL). Para datos reales: DATA_MODE=real y `npm run data:refresh`.',
    );
    return 2;
  }
  const stale = source.manifest ? Object.entries(source.manifest.series).filter(([, s]) => s.stale).length : 0;
  if (stale) console.warn(`Aviso: ${stale} serie(s) marcadas stale en el manifest (se informa en CONTROL y LEEME).`);

  const auth = await getAuthClient(cfg);
  const api = await createGoogleSheetsApi(auth, {
    onRetry: ({ attempt, delayMs, message }) => console.warn(`  reintento ${attempt} en ${Math.round(delayMs)} ms (${message})`),
  });

  let failures = 0;
  for (const topic of args.topics) {
    try {
      let resolved = resolveSpreadsheetId(topic);
      if (!resolved) {
        if (cfg.mode === 'service_account') {
          const email = serviceAccountEmail(cfg);
          throw new Error(
            `No hay documento para "${TOPIC_LABELS[topic]}". Con cuenta de servicio no se crean documentos: creá el Sheet ` +
              `"Argentina — ${TOPIC_LABELS[topic]}", compartilo como Editor con ${email ?? 'el email de la cuenta de servicio'} y poné su ID en ${envKey(topic)}.`,
          );
        }
        const created = await createTopicSpreadsheet(api, topic);
        saveLocalConfigEntry(topic, {
          spreadsheetId: created.spreadsheetId,
          url: created.url,
          title: `Argentina — ${TOPIC_LABELS[topic]}`,
          createdAt: new Date().toISOString(),
        });
        console.log(`Creado "Argentina — ${TOPIC_LABELS[topic]}" (ID guardado en ${rel(localConfigPath())})`);
        resolved = { id: created.spreadsheetId, from: 'config' };
      }
      if (cfg.mode === 'oauth' && api.isTrashed && (await api.isTrashed(resolved.id)) === true) {
        throw new Error(
          `El documento de "${TOPIC_LABELS[topic]}" (${resolved.id}) está en la papelera. Restauralo o quitá su ID de ${resolved.from === 'env' ? envKey(topic) : rel(localConfigPath())} para crear uno nuevo.`,
        );
      }
      const result = await syncTopic(api, resolved.id, topic, source, {
        runMode: `sync (${cfg.mode === 'oauth' ? 'OAuth de usuario' : 'cuenta de servicio'})`,
        log: (m) => console.log(m),
      });
      for (const w of result.warnings) console.warn(`  aviso: ${w}`);
      console.log(`  https://docs.google.com/spreadsheets/d/${resolved.id}/edit`);
    } catch (e) {
      failures++;
      console.error(`[${topic}] ERROR: ${sanitizeError(e)}`);
    }
  }
  return failures ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(`ERROR: ${sanitizeError(e)}`);
      process.exit(1);
    },
  );
}
