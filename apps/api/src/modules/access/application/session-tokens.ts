import { ACCESS_TOKEN_TTL_SECONDS, sessionExpiry } from '../domain/session';
import type { SessionStore } from './ports/session-store';
import type { AccessTokenIssuer, SecretTokens } from './ports/tokens';
import { isUuid } from './uuid';

export interface AuthTokens {
  accessToken: string;
  /** Seconds until the access token expires. */
  accessTokenExpiresIn: number;
  refreshToken: string;
}

export interface SessionDeps {
  sessions: SessionStore;
  accessTokens: AccessTokenIssuer;
  secrets: SecretTokens;
  now: () => Date;
}

/**
 * The refresh token is "<sessionId>.<secret>": the id locates the session, so a
 * replayed old secret can be told apart from an unknown token (US-ACC-03).
 */
export function formatRefreshToken(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

export function parseRefreshToken(token: string): { sessionId: string; secret: string } | null {
  const separator = token.indexOf('.');
  const sessionId = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  if (separator < 0 || !isUuid(sessionId) || secret.length === 0) return null;
  return { sessionId, secret };
}

export async function issueTokens(
  deps: SessionDeps,
  session: { id: string; userId: string },
  secret: string,
  now: Date,
): Promise<AuthTokens> {
  return {
    accessToken: await deps.accessTokens.issue(
      { userId: session.userId, sessionId: session.id },
      now,
    ),
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: formatRefreshToken(session.id, secret),
  };
}

export async function startSession(
  deps: SessionDeps,
  userId: string,
  now: Date,
): Promise<AuthTokens> {
  const secret = deps.secrets.generate();
  const id = await deps.sessions.create({
    userId,
    refreshTokenHash: deps.secrets.hash(secret),
    expiresAt: sessionExpiry(now),
  });
  return issueTokens(deps, { id, userId }, secret, now);
}
