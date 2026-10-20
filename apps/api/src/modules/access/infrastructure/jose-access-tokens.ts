import { jwtVerify, SignJWT } from 'jose';

import type { AccessTokenIssuer, AccessTokenVerifier } from '../application/ports/tokens';
import { ACCESS_TOKEN_TTL_SECONDS } from '../domain/session';

export const JWT_ISSUER = 'multicooperativa-api';
export const JWT_AUDIENCE = 'multicooperativa-app';

/**
 * HS256 access token with only `sub` (user) and `sid` (session): permissions
 * are resolved on every request, never read from the token (NFR-ACC-04).
 */
export class JoseAccessTokens implements AccessTokenIssuer, AccessTokenVerifier {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  issue(claims: { userId: string; sessionId: string }, now: Date): Promise<string> {
    const issuedAt = Math.floor(now.getTime() / 1000);
    return new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
      .sign(this.key);
  }

  async verify(token: string, now: Date): Promise<{ userId: string; sessionId: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        // Pinned: a token signed with any other algorithm (or "none") is rejected.
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        currentDate: now,
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      return null;
    }
  }
}
