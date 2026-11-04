/**
 * npm run sheets:auth — OAuth de usuario (una sola vez).
 *
 * Flujo "loopback" para clientes OAuth de tipo "Desktop app":
 *  1. levanta un servidor HTTP efímero en 127.0.0.1:<puerto libre>;
 *  2. abre el navegador en la pantalla de consentimiento de Google (PKCE + state);
 *  3. recibe el código en el redirect local, lo canjea y guarda SOLO el refresh
 *     token en GOOGLE_OAUTH_TOKEN_PATH (.secrets/, gitignored, permisos 0600).
 * Nunca imprime tokens ni el client secret.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { OAUTH_SCOPES, readAuthConfig, saveToken } from '../auth';
import { sanitizeError } from '../client';

function openBrowser(url: string): void {
  const fallback = () => {
    if (process.platform !== 'win32') return;
    try {
      const p = spawn('rundll32', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore' });
      p.on('error', () => {});
      p.unref();
    } catch {
      /* se muestra la URL igualmente */
    }
  };
  try {
    const p =
      process.platform === 'win32'
        ? // cmd /c start "" "<url>": las comillas protegen los "&" de la URL (verbatim para que Node no re-escape).
          spawn('cmd', ['/d', '/s', '/c', `start "" "${url}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true, windowsHide: true })
        : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' });
    p.on('error', fallback);
    p.unref();
  } catch {
    fallback();
  }
}

export const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

const page = (msg: string) =>
  `<!doctype html><meta charset="utf-8"><title>Monitor INDEC</title><body style="font-family:sans-serif;padding:2rem"><h2>${msg}</h2><p>Podés cerrar esta pestaña y volver a la terminal.</p></body>`;

/**
 * Servidor loopback efímero en 127.0.0.1 (puerto libre elegido por el SO).
 * `waitForCode` resuelve con el código de autorización si el `state` coincide,
 * rechaza si Google devuelve `error` o si vence el plazo, y siempre cierra el servidor.
 */
export async function startLoopback(): Promise<{ redirectUri: string; waitForCode: (state: string, timeoutMs: number) => Promise<string>; close: () => void }> {
  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  const redirectUri = `http://127.0.0.1:${port}`;
  const close = () => {
    server.close();
    server.closeAllConnections?.();
  };
  const waitForCode = (state: string, timeoutMs: number) =>
    new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Tiempo de espera agotado (${Math.round(timeoutMs / 1000)} s) sin recibir la autorización. Volvé a correr \`npm run sheets:auth\`.`)),
        timeoutMs,
      );
      server.on('request', (req, res) => {
        const u = new URL(req.url ?? '/', redirectUri);
        if (u.pathname !== '/') {
          res.writeHead(404).end();
          return;
        }
        const err = u.searchParams.get('error');
        const c = u.searchParams.get('code');
        const st = u.searchParams.get('state');
        const html = { 'content-type': 'text/html; charset=utf-8' };
        if (st !== state) {
          res.writeHead(400, html).end(page('Respuesta inválida (state no coincide).'));
          return;
        }
        if (err) {
          res.writeHead(400, html).end(page('Autorización cancelada o rechazada.'));
          clearTimeout(timer);
          reject(
            new Error(
              `Google devolvió "${err}". Si tu organización restringe apps OAuth externas, usá una pantalla de consentimiento "Interna" ` +
                'en un proyecto de Google Cloud de tu organización o pedí al administrador que habilite el cliente (ver docs/google-sheets.md).',
            ),
          );
          return;
        }
        if (!c) {
          res.writeHead(400, html).end(page('Respuesta sin código de autorización.'));
          return;
        }
        res.writeHead(200, html).end(page('Autorización completa.'));
        clearTimeout(timer);
        resolve(c);
      });
    }).finally(close);
  return { redirectUri, waitForCode, close };
}

export async function main(): Promise<number> {
  const cfg = readAuthConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    console.error(
      'Faltan GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET en .env.\n' +
        'Creá un cliente OAuth de tipo "Desktop app" en Google Cloud Console (ver docs/google-sheets.md).',
    );
    return 1;
  }
  const { google } = await import('googleapis');

  const loop = await startLoopback();
  const redirectUri = loop.redirectUri;
  const client = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, redirectUri);
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // garantiza que Google devuelva refresh_token
    scope: OAUTH_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256' as never,
  });

  console.log('Se abrirá el navegador para autorizar el acceso a Google Sheets.');
  console.log('Si no se abre, copiá esta URL en el navegador e iniciá sesión con tu cuenta de Google:\n');
  console.log(authUrl + '\n');
  console.log(`Esperando la autorización en ${redirectUri} (máximo ${AUTH_TIMEOUT_MS / 60000} minutos)...`);
  openBrowser(authUrl);

  const code = await loop.waitForCode(state, AUTH_TIMEOUT_MS);
  console.log('Código recibido; canjeando por el refresh token...');

  const { tokens } = await client.getToken({ code, codeVerifier, redirect_uri: redirectUri });
  if (!tokens.refresh_token) {
    console.error('Google no devolvió refresh token. Revocá el acceso de la app en https://myaccount.google.com/permissions y reintentá.');
    return 1;
  }
  const granted = (tokens.scope ?? '').split(/\s+/);
  const missing = OAUTH_SCOPES.filter((s) => !granted.includes(s));
  if (missing.length) {
    console.error(`No se otorgaron todos los permisos necesarios (faltan: ${missing.join(', ')}). Reintentá y marcá todas las casillas.`);
    return 1;
  }
  saveToken(cfg.tokenPath, {
    refresh_token: tokens.refresh_token,
    scope: tokens.scope ?? OAUTH_SCOPES.join(' '),
    token_type: tokens.token_type ?? 'Bearer',
    created_at: new Date().toISOString(),
  });
  console.log(`Listo: refresh token guardado en ${path.relative(process.cwd(), cfg.tokenPath).replace(/\\/g, '/')} (no lo compartas ni lo commitees).`);
  console.log('Siguiente paso: `npm run sheets:sync` (con datos reales en data/store; si todavía no hay, primero `npm run data:refresh`).');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().then(
    (c) => process.exit(c),
    (e) => {
      console.error(`ERROR: ${sanitizeError(e)}`);
      process.exit(1);
    },
  );
}
