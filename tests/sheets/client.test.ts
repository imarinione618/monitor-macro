import { describe, expect, it } from 'vitest';
import { isRetryable, sanitizeError, withRetry } from '../../src/sheets/client';
import { normalizeSpreadsheetId, resolveSpreadsheetId } from '../../src/sheets/config';
import { credentialStatus, readAuthConfig } from '../../src/sheets/auth';

const httpErr = (status: number, headers: Record<string, string> = {}) =>
  Object.assign(new Error(`status ${status}`), { response: { status, headers } });

describe('reintentos', () => {
  it('reintenta 429/5xx con backoff y termina OK', async () => {
    const delays: number[] = [];
    let n = 0;
    const out = await withRetry(
      'x',
      async () => {
        n++;
        if (n === 1) throw httpErr(429, { 'retry-after': '3' });
        if (n === 2) throw httpErr(503);
        return 'ok';
      },
      { sleep: async (ms) => void delays.push(ms), baseDelayMs: 10 },
    );
    expect(out).toBe('ok');
    expect(n).toBe(3);
    expect(delays[0]).toBeGreaterThanOrEqual(3000); // respeta Retry-After
  });

  it('no reintenta 400/403 y el error no contiene tokens', async () => {
    let n = 0;
    const err = Object.assign(new Error('bad request Bearer ya29.SECRETO123 access_token=abc&x=1'), { response: { status: 400 } });
    await expect(
      withRetry('y', async () => {
        n++;
        throw err;
      }, { sleep: async () => {} }),
    ).rejects.toThrow(/HTTP 400/);
    expect(n).toBe(1);
    const msg = sanitizeError(err);
    expect(msg).not.toContain('SECRETO');
    expect(msg).not.toContain('abc');
    expect(isRetryable(httpErr(500))).toBe(true);
    expect(isRetryable(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe(true);
    expect(isRetryable(httpErr(403))).toBe(false);
  });

  it('agota reintentos', async () => {
    await expect(withRetry('z', async () => { throw httpErr(500); }, { maxRetries: 2, sleep: async () => {} })).rejects.toThrow(/HTTP 500/);
  });
});

describe('configuración', () => {
  it('IDs desde env (o URL) con prioridad sobre config local', () => {
    expect(normalizeSpreadsheetId('https://docs.google.com/spreadsheets/d/abc_DEF-123/edit#gid=0')).toBe('abc_DEF-123');
    expect(resolveSpreadsheetId('precios', { SHEETS_ID_PRECIOS: 'id-env' }, '/no/existe.json')).toEqual({ id: 'id-env', from: 'env' });
    expect(resolveSpreadsheetId('precios', {}, '/no/existe.json')).toBeNull();
  });
  it('estado de credenciales sin red', () => {
    expect(credentialStatus(readAuthConfig({ GOOGLE_AUTH_MODE: 'oauth' })).ok).toBe(false);
    expect(credentialStatus(readAuthConfig({ GOOGLE_AUTH_MODE: 'service_account' })).ok).toBe(false);
    expect(readAuthConfig({ GOOGLE_AUTH_MODE: 'service_account' }).mode).toBe('service_account');
    // cliente OAuth cargado pero sin refresh token → configuración parcial con mensaje accionable
    const partial = credentialStatus(
      readAuthConfig({ GOOGLE_AUTH_MODE: 'oauth', GOOGLE_OAUTH_CLIENT_ID: 'x.apps.googleusercontent.com', GOOGLE_OAUTH_CLIENT_SECRET: 's', GOOGLE_OAUTH_TOKEN_PATH: '/no/existe/token.json' }),
    );
    expect(partial).toMatchObject({ ok: false, partial: true });
    expect(partial.reason).toContain('npm run sheets:auth');
  });
});
