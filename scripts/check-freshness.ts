/**
 * Informa la fecha de la última consulta exitosa por fuente. Nunca falla (exit 0): una fuente
 * caída no debe impedir publicar el dashboard con el resto de los datos.
 * En GitHub Actions emite anotaciones ::warning:: para las fuentes con fallas.
 *
 *   npx tsx scripts/check-freshness.ts
 */
import { getSourceFreshness } from '../src/web/server/freshness';
import { formatDateTimeAR } from '../src/web/lib/format';

const gha = process.env.GITHUB_ACTIONS === 'true';
const rows = getSourceFreshness();
if (!rows.length) console.log('Sin manifests: no hay datos de frescura por fuente.');
for (const f of rows) {
  const when = formatDateTimeAR(f.updatedAt);
  if (f.ok) {
    console.log(`OK     ${f.label}: consultado ${when} (${f.total} componentes)`);
  } else {
    const msg = `${f.label}: falló la última consulta en ${f.failed.length} de ${f.total} componentes; se publican los datos conservados de esos componentes (última consulta exitosa a la fuente: ${when}). Con falla: ${f.failed.slice(0, 8).join(', ')}${f.failed.length > 8 ? '…' : ''}`;
    console.log(gha ? `::warning title=Fuente desactualizada — ${f.label}::${msg}` : `AVISO  ${msg}`);
  }
}
