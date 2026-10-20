export const SESSION_TTL_DAYS = 30;
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface SessionState {
  readonly refreshTokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export type RefreshCheck = 'valid' | 'expired' | 'revoked' | 'reused';

/** Each rotation issues a refresh token valid for 30 days (NFR-ACC-02). */
export function sessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_TTL_DAYS * DAY_IN_MS);
}

/**
 * A session keeps only the hash of its current refresh token. Presenting any
 * other token of the same session means an old one was replayed: the caller
 * must revoke the whole session (US-ACC-03).
 */
export function checkRefresh(
  session: SessionState,
  presentedTokenHash: string,
  now: Date,
): RefreshCheck {
  if (session.revokedAt) return 'revoked';
  if (session.refreshTokenHash !== presentedTokenHash) return 'reused';
  if (now.getTime() >= session.expiresAt.getTime()) return 'expired';
  return 'valid';
}
