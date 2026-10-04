/** Signs the short-lived access token. It carries identity only, never permissions (RNF-ACC-04). */
export interface AccessTokenIssuer {
  issue(claims: { userId: string; sessionId: string }, now: Date): Promise<string>;
}

export interface AccessTokenVerifier {
  /** Null for a bad signature, a wrong issuer or audience, or an expired token. */
  verify(token: string, now: Date): Promise<{ userId: string; sessionId: string } | null>;
}

/** Opaque high-entropy secrets (refresh tokens, invitation links). Only their hash is stored. */
export interface SecretTokens {
  generate(): string;
  hash(token: string): string;
}
