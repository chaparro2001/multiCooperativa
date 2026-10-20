import { decodeJwt, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';

import { JoseAccessTokens, JWT_AUDIENCE, JWT_ISSUER } from './jose-access-tokens';

const SECRET = 'a-test-secret-of-at-least-32-characters';
const now = new Date('2026-10-10T10:00:00Z');

describe('JoseAccessTokens (NFR-ACC-02)', () => {
  it('signs a 15-minute JWT with the user and the session, without permissions', async () => {
    const token = await new JoseAccessTokens(SECRET).issue(
      { userId: 'user-1', sessionId: 'session-1' },
      now,
    );

    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      currentDate: now,
    });
    expect(payload).toEqual({
      sub: 'user-1',
      sid: 'session-1',
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
      iat: now.getTime() / 1000,
      exp: now.getTime() / 1000 + 15 * 60,
    });
  });

  it('another key does not validate the signature', async () => {
    const token = await new JoseAccessTokens(SECRET).issue({ userId: 'u', sessionId: 's' }, now);

    await expect(
      jwtVerify(token, new TextEncoder().encode(`${SECRET}-otra`), { currentDate: now }),
    ).rejects.toThrow();
    expect(decodeJwt(token).sub).toBe('u');
  });
});

describe('JoseAccessTokens.verify', () => {
  const tokens = new JoseAccessTokens(SECRET);
  const claims = { userId: 'user-1', sessionId: 'session-1' };

  it('returns the user and the session of a valid token', async () => {
    const token = await tokens.issue(claims, now);

    await expect(tokens.verify(token, now)).resolves.toEqual(claims);
  });

  it('rejects an expired token', async () => {
    const token = await tokens.issue(claims, now);

    await expect(
      tokens.verify(token, new Date(now.getTime() + 15 * 60 * 1000)),
    ).resolves.toBeNull();
  });

  it('rejects a token signed with another key', async () => {
    const token = await new JoseAccessTokens(`${SECRET}-otra`).issue(claims, now);

    await expect(tokens.verify(token, now)).resolves.toBeNull();
  });

  it('rejects an unsigned token (alg none)', async () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none' })}.${encode({
      sub: 'user-1',
      sid: 'session-1',
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
      exp: now.getTime() / 1000 + 60,
    })}.`;

    await expect(tokens.verify(unsigned, now)).resolves.toBeNull();
  });

  it('rejects garbage', async () => {
    await expect(tokens.verify('not-a-jwt', now)).resolves.toBeNull();
  });
});
