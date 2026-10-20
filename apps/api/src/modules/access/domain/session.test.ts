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

describe('session (NFR-ACC-02)', () => {
  it('the refresh token is valid for 30 days', () => {
    expect(sessionExpiry(now)).toEqual(new Date(now.getTime() + SESSION_TTL_DAYS * DAY_IN_MS));
  });

  it('accepts the current refresh token of a non-expired session', () => {
    expect(checkRefresh(session(), 'hash-vigente', now)).toBe('valid');
  });

  it('US-ACC-03: Given an already used refresh token, when it is used again, then the reuse is detected', () => {
    expect(checkRefresh(session(), 'hash-anterior', now)).toBe('reused');
  });

  it('rejects a revoked session even if the token matches', () => {
    expect(checkRefresh(session({ revokedAt: now }), 'hash-vigente', now)).toBe('revoked');
  });

  it('an already revoked session does not count as reuse again', () => {
    expect(checkRefresh(session({ revokedAt: now }), 'hash-anterior', now)).toBe('revoked');
  });

  it('rejects an expired session', () => {
    expect(checkRefresh(session({ expiresAt: now }), 'hash-vigente', now)).toBe('expired');
  });
});
