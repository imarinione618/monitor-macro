/**
 * Autenticación con Google (dos modos):
 *
 *  (a) OAuth de usuario ("oauth", recomendado). Cliente OAuth "Desktop app" del
 *      proyecto de Google Cloud del usuario. `npm run sheets:auth` hace el flujo
 *      loopback una vez y guarda el refresh token en GOOGLE_OAUTH_TOKEN_PATH.
 *      Los documentos se crean en Mi unidad del usuario.
 *      Scopes:
 *        - spreadsheets: leer/escribir los 4 documentos (también si el usuario los
 *          creó a mano y pasó su ID en SHEETS_ID_*; drive.file no alcanzaría).
 *        - drive.file: acceso de Drive SOLO a archivos creados/abiertos por esta app;
 *          se usa para detectar si un documento propio fue enviado a la papelera
 *          (la API de Sheets sigue escribiendo en archivos en la papelera).
 *          No se pide `drive` completo.
 *
 *  (b) Cuenta de servicio ("service_account"). No tiene cuota de Drive propia:
 *      NO crea documentos. El usuario crea los 4 Sheets, los comparte como Editor
 *      con el email de la cuenta y pone los IDs en SHEETS_ID_*. Scope: spreadsheets.
 *
 * Nunca se loguean tokens ni secretos.
 */
import fs from 'node:fs';
import path from 'node:path';

export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];
export const SERVICE_ACCOUNT_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export type AuthMode = 'oauth' | 'service_account';

export interface AuthConfig {
  mode: AuthMode;
  clientId: string;
  clientSecret: string;
  tokenPath: string;
  keyFile: string;
}

export interface StoredToken {
  refresh_token: string;
  scope?: string;
  token_type?: string;
  created_at: string;
}

export function readAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const raw = (env.GOOGLE_AUTH_MODE ?? 'oauth').trim().toLowerCase();
  const mode: AuthMode = raw === 'service_account' || raw === 'service-account' ? 'service_account' : 'oauth';
  return {
    mode,
    clientId: (env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim(),
    clientSecret: (env.GOOGLE_OAUTH_CLIENT_SECRET ?? '').trim(),
    tokenPath: path.resolve((env.GOOGLE_OAUTH_TOKEN_PATH ?? '').trim() || '.secrets/google-oauth-token.json'),
    keyFile: (env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ?? '').trim() ? path.resolve(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE!.trim()) : '',
  };
}

export function readToken(file: string): StoredToken | null {
  try {
    const t = JSON.parse(fs.readFileSync(file, 'utf8')) as StoredToken;
    return t && typeof t.refresh_token === 'string' && t.refresh_token ? t : null;
  } catch {
    return null;
  }
}

/** Guarda el token con permisos restringidos (0600 donde el SO lo soporte). */
export function saveToken(file: string, token: StoredToken): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(token, null, 1), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

/**
 * ¿Hay credenciales utilizables? (sin hacer llamadas de red).
 * `partial` = el usuario empezó a configurar un modo pero falta un paso (p.ej. cliente
 * OAuth cargado pero sin refresh token): en ese caso sheets:sync falla con un mensaje
 * accionable en lugar de caer en la vista previa automática.
 */
export function credentialStatus(cfg: AuthConfig): { ok: boolean; partial: boolean; reason?: string } {
  if (cfg.mode === 'oauth') {
    if (!cfg.clientId || !cfg.clientSecret) {
      const partial = Boolean(cfg.clientId || cfg.clientSecret);
      return { ok: false, partial, reason: 'faltan GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET en .env' };
    }
    if (!readToken(cfg.tokenPath)) {
      return { ok: false, partial: true, reason: `falta autorizar la cuenta de Google: no hay refresh token en ${rel(cfg.tokenPath)}. Corré \`npm run sheets:auth\`` };
    }
    return { ok: true, partial: false };
  }
  if (!cfg.keyFile) return { ok: false, partial: false, reason: 'falta GOOGLE_SERVICE_ACCOUNT_KEY_FILE en .env' };
  if (!fs.existsSync(cfg.keyFile)) return { ok: false, partial: true, reason: `no existe la clave de la cuenta de servicio (${rel(cfg.keyFile)})` };
  return { ok: true, partial: false };
}

/** Cliente de auth de google-auth-library listo para googleapis. */
export async function getAuthClient(cfg: AuthConfig): Promise<unknown> {
  const { google } = await import('googleapis');
  if (cfg.mode === 'oauth') {
    const token = readToken(cfg.tokenPath);
    if (!token) throw new Error(`No hay refresh token en ${rel(cfg.tokenPath)}. Corré \`npm run sheets:auth\`.`);
    const missing = OAUTH_SCOPES.filter((s) => token.scope && !token.scope.split(/\s+/).includes(s));
    if (missing.length) throw new Error(`El token guardado no tiene los scopes ${missing.join(', ')}. Volvé a correr \`npm run sheets:auth\`.`);
    const client = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret);
    client.setCredentials({ refresh_token: token.refresh_token });
    // Si Google rota el refresh token, persistirlo (sin loguearlo).
    client.on('tokens', (t) => {
      if (t.refresh_token) saveToken(cfg.tokenPath, { ...token, refresh_token: t.refresh_token, created_at: new Date().toISOString() });
    });
    return client;
  }
  const auth = new google.auth.GoogleAuth({ keyFile: cfg.keyFile, scopes: SERVICE_ACCOUNT_SCOPES });
  return auth.getClient();
}

/** Email de la cuenta de servicio (para indicar con quién compartir los documentos). */
export function serviceAccountEmail(cfg: AuthConfig): string | null {
  try {
    return (JSON.parse(fs.readFileSync(cfg.keyFile, 'utf8')) as { client_email?: string }).client_email ?? null;
  } catch {
    return null;
  }
}

function rel(p: string): string {
  return path.relative(process.cwd(), p).replace(/\\/g, '/') || p;
}
