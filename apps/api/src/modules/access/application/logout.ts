import { parseRefreshToken, type SessionDeps } from './session-tokens';

/**
 * HU-ACC-03: revokes the session on the server. Idempotent and silent: an
 * unknown or stale token is simply ignored, so the client can always clear its tokens.
 */
export async function logout(
  deps: Pick<SessionDeps, 'sessions' | 'secrets' | 'now'>,
  refreshToken: string,
): Promise<void> {
  const parsed = parseRefreshToken(refreshToken);
  if (!parsed) return;

  const session = await deps.sessions.findById(parsed.sessionId);
  if (!session || session.revokedAt) return;
  if (session.refreshTokenHash !== deps.secrets.hash(parsed.secret)) return;

  await deps.sessions.revoke(session.id, deps.now());
}
