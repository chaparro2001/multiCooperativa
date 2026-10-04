import { SignJWT } from 'jose';

import type { AccessTokenIssuer } from '../application/ports/tokens';
import { ACCESS_TOKEN_TTL_SECONDS } from '../domain/session';

export const JWT_ISSUER = 'multicooperativa-api';
export const JWT_AUDIENCE = 'multicooperativa-app';

/**
 * HS256 access token with only `sub` (user) and `sid` (session): permissions
 * are resolved on every request, never read from the token (RNF-ACC-04).
 */
export class JoseAccessTokens implements AccessTokenIssuer {
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
}
