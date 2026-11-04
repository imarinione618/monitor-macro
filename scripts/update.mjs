import { spawnSync } from 'node:child_process';

// Fuentes independientes. La integración Sheets existente sigue limitada a INDEC.
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let failed = false;
for (const task of ['data:refresh', 'monetary:refresh', 'sheets:sync']) {
  const args = ['run', task];
  if (process.argv.includes('--full') && task !== 'sheets:sync') args.push('--', '--full');
  const result = spawnSync(npm, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0 || result.error) { failed = true; console.error(`${task}: actualización con errores; se conservan datos previos.`); }
}
process.exitCode = failed ? 1 : 0;
