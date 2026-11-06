import 'dotenv/config';
import { refreshMonetary } from './refresh';
import { MONETARY_CATALOG } from './catalog';
import { refreshCaucion } from './caucion';

const args = process.argv.slice(2);
const selected = args.find(arg => arg.startsWith('--ids='))?.slice(6).split(',').map(Number);
const unknown = args.filter(arg => arg !== '--full' && !arg.startsWith('--ids='));
if (unknown.length || selected?.some(id => !MONETARY_CATALOG.some(def => def.bcraId === id))) {
  console.error('Uso: npm run monetary:refresh -- [--full] [--ids=44,7,...]');
  process.exitCode = 1;
} else {
  refreshMonetary({ full: args.includes('--full'), ...(selected ? { catalog: MONETARY_CATALOG.filter(def => selected.includes(def.bcraId)) } : {}) })
    .then(async result => {
      console.log(`BCRA: ${result.outcomes.filter(o => o.ok).length}/${result.outcomes.length} series actualizadas; ${result.revisions} revisiones.`);
      if (!result.ok) process.exitCode = 1;
      // Caución A3: fuente independiente; se actualiza en la corrida completa (no con --ids).
      if (!selected) {
        const caucion = await refreshCaucion();
        console.log(`A3 caución: ${caucion.ok ? 'actualizada' : 'falló; se conserva el último dato'}; ${caucion.revisions} revisiones.`);
        if (!caucion.ok) process.exitCode = 1;
      }
    })
    .catch(error => { console.error(`Actualización BCRA: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}
