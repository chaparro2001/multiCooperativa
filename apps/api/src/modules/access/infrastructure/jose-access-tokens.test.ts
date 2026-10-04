import { decodeJwt, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';

import { JoseAccessTokens, JWT_AUDIENCE, JWT_ISSUER } from './jose-access-tokens';

const SECRET = 'un-secreto-de-pruebas-de-al-menos-32-caracteres';
const now = new Date('2026-10-10T10:00:00Z');

describe('JoseAccessTokens (RNF-ACC-02)', () => {
  it('firma un JWT de 15 minutos con el usuario y la sesión, sin permisos', async () => {
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

  it('otra clave no valida la firma', async () => {
    const token = await new JoseAccessTokens(SECRET).issue({ userId: 'u', sessionId: 's' }, now);

    await expect(
      jwtVerify(token, new TextEncoder().encode(`${SECRET}-otra`), { currentDate: now }),
    ).rejects.toThrow();
    expect(decodeJwt(token).sub).toBe('u');
  });
});
