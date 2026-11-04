import { describe, expect, it } from 'vitest';
import { startLoopback } from '../../src/sheets/cli/auth';

describe('sheets:auth — servidor loopback', () => {
  it('escucha en 127.0.0.1, valida state y devuelve el código', async () => {
    const loop = await startLoopback();
    expect(loop.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const p = loop.waitForCode('estado-ok', 10_000);
    const bad = await fetch(`${loop.redirectUri}/?code=x&state=otro`);
    expect(bad.status).toBe(400);
    const fav = await fetch(`${loop.redirectUri}/favicon.ico`);
    expect(fav.status).toBe(404);
    const ok = await fetch(`${loop.redirectUri}/?code=CODIGO123&state=estado-ok`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('Autorización completa');
    await expect(p).resolves.toBe('CODIGO123');
  });

  it('error de Google (p.ej. admin_policy_enforced) → mensaje accionable', async () => {
    const loop = await startLoopback();
    const p = loop.waitForCode('s', 10_000);
    const assertion = expect(p).rejects.toThrow(/Interna/);
    await fetch(`${loop.redirectUri}/?error=admin_policy_enforced&state=s`);
    await assertion;
  });

  it('timeout', async () => {
    const loop = await startLoopback();
    await expect(loop.waitForCode('s', 50)).rejects.toThrow(/Tiempo de espera agotado/);
  });
});
