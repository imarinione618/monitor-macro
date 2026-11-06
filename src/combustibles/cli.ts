import { refreshCombustibles } from './refresh';

const args = process.argv.slice(2);
const only = args.find(arg => arg.startsWith('--solo='))?.slice(7);
const unknown = args.filter(arg => arg !== '--full' && !arg.startsWith('--solo='));
if (unknown.length || (only !== undefined && only !== 'surtidor' && only !== 'eess')) {
  console.error('Uso: tsx src/combustibles/cli.ts [--full] [--solo=surtidor|eess]');
  process.exitCode = 1;
} else {
  refreshCombustibles({ full: args.includes('--full'), ...(only ? { only: only as 'surtidor' | 'eess' } : {}) })
    .then(result => {
      const show = (label: string, r: { ok: boolean; skipped?: boolean; error?: string }) => (r.skipped ? `${label}: sin cambios (no correspondía descargar)` : r.ok ? `${label}: actualizado` : `${label}: falló (${r.error}); se conserva el último dato`);
      console.log(`${show('Surtidor Res. 314', result.surtidor)}${result.surtidor.lastDay ? ` hasta ${result.surtidor.lastDay}` : ''}`);
      console.log(`${show('EESS Res. 1104', result.eess)}${result.eess.lastPeriod ? ` hasta ${result.eess.lastPeriod}` : ''}`);
      console.log(`${result.revisions} revisiones registradas.`);
      if (!result.ok) process.exitCode = 1;
    })
    .catch(error => { console.error(`Actualización de combustibles: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}
