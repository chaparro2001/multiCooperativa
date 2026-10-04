import { describe, expect, it } from 'vitest';

import { checkRefresh, SESSION_TTL_DAYS, sessionExpiry } from './session';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-10T10:00:00Z');

function session(overrides: Partial<Parameters<typeof checkRefresh>[0]> = {}) {
  return {
    refreshTokenHash: 'hash-vigente',
    expiresAt: new Date(now.getTime() + DAY_IN_MS),
    revokedAt: null,
    ...overrides,
  };
}

describe('sesión (RNF-ACC-02)', () => {
  it('el token de refresco vale 30 días', () => {
    expect(sessionExpiry(now)).toEqual(new Date(now.getTime() + SESSION_TTL_DAYS * DAY_IN_MS));
  });

  it('acepta el token de refresco vigente de una sesión no caducada', () => {
    expect(checkRefresh(session(), 'hash-vigente', now)).toBe('valid');
  });

  it('HU-ACC-03: Dado un token de refresco ya utilizado, cuando se usa de nuevo, entonces se detecta la reutilización', () => {
    expect(checkRefresh(session(), 'hash-anterior', now)).toBe('reused');
  });

  it('rechaza una sesión revocada aunque el token coincida', () => {
    expect(checkRefresh(session({ revokedAt: now }), 'hash-vigente', now)).toBe('revoked');
  });

  it('una sesión ya revocada no vuelve a contar como reutilización', () => {
    expect(checkRefresh(session({ revokedAt: now }), 'hash-anterior', now)).toBe('revoked');
  });

  it('rechaza una sesión caducada', () => {
    expect(checkRefresh(session({ expiresAt: now }), 'hash-vigente', now)).toBe('expired');
  });
});
