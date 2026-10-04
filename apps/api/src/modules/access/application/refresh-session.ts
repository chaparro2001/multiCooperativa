import { checkRefresh, sessionExpiry } from '../domain/session';
import { InvalidRefreshTokenError } from './errors';
import {
  type AuthTokens,
  issueTokens,
  parseRefreshToken,
  type SessionDeps,
} from './session-tokens';

/** HU-ACC-03: rotates the refresh token; replaying an old one revokes the whole session. */
export async function refreshSession(deps: SessionDeps, refreshToken: string): Promise<AuthTokens> {
  const now = deps.now();
  const parsed = parseRefreshToken(refreshToken);
  if (!parsed) throw new InvalidRefreshTokenError();

  const session = await deps.sessions.findById(parsed.sessionId);
  if (!session) throw new InvalidRefreshTokenError();

  const presentedHash = deps.secrets.hash(parsed.secret);
  const check = checkRefresh(session, presentedHash, now);
  if (check === 'reused') await deps.sessions.revoke(session.id, now);
  if (check !== 'valid') throw new InvalidRefreshTokenError();

  const secret = deps.secrets.generate();
  const rotated = await deps.sessions.rotate(session.id, presentedHash, {
    refreshTokenHash: deps.secrets.hash(secret),
    expiresAt: sessionExpiry(now),
  });
  if (!rotated) {
    // The same token was used twice at the same time: that is also a replay.
    await deps.sessions.revoke(session.id, now);
    throw new InvalidRefreshTokenError();
  }
  return issueTokens(deps, session, secret, now);
}
