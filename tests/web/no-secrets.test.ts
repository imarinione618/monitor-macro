/**
 * Verifica que el bundle del navegador (.next/static) no contenga secretos.
 * Requiere un build previo (`npx next build`); si no existe, el test se saltea.
 * El valor del token se lee de .env SIN imprimirlo (los mensajes solo nombran archivos).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
// Se inspecciona lo que llega al navegador: el bundle de Next y el sitio estático exportado (out/).
const STATIC_DIRS = [path.join(ROOT, '.next', 'static'), path.join(ROOT, 'out')].filter((d) => fs.existsSync(d));
const hasBuild = STATIC_DIRS.length > 0;

if (!hasBuild) {
  // eslint-disable-next-line no-console
  console.warn('[no-secrets] No existe .next/static: ejecutá `npx next build` antes para verificar el bundle. Test salteado.');
}

function readEnvValue(name: string): string | null {
  try {
    const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && m[1] === name) {
        const v = m[2]!.replace(/^["']|["']$/g, '').trim();
        return v || null;
      }
    }
  } catch {
    /* sin .env */
  }
  return null;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

describe.skipIf(!hasBuild)('bundle del navegador sin secretos (.next/static)', () => {
  const files = hasBuild ? STATIC_DIRS.flatMap((d) => walk(d)).filter((f) => /\.(js|css|html|json|map|txt)$/.test(f)) : [];
  const contents = files.map((f) => ({ rel: path.relative(ROOT, f), text: fs.readFileSync(f, 'utf8') }));

  const check = (needle: string) => contents.filter((c) => c.text.includes(needle)).map((c) => c.rel);

  it('hay archivos para inspeccionar', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(['INDEC_API_TOKEN', 'GOOGLE_OAUTH_CLIENT_SECRET', 'Bearer '])('no contiene "%s"', (needle) => {
    expect(check(needle), `"${needle}" aparece en estos archivos`).toEqual([]);
  });

  it('no contiene el valor del token de .env', () => {
    const token = readEnvValue('INDEC_API_TOKEN');
    if (!token) return; // sin token configurado: nada que buscar
    const hits = check(token);
    // No se imprime el token: solo la lista de archivos.
    expect(hits, 'el valor de INDEC_API_TOKEN aparece en el bundle').toEqual([]);
  });

  it('no contiene el valor del client secret de Google de .env', () => {
    const secret = readEnvValue('GOOGLE_OAUTH_CLIENT_SECRET');
    if (!secret) return;
    expect(check(secret), 'el valor de GOOGLE_OAUTH_CLIENT_SECRET aparece en el bundle').toEqual([]);
  });
});
