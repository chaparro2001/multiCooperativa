import type { Permission } from '../domain/permission';
import { CooperativeNotFoundError, UnauthenticatedError } from './errors';
import type { AccessContextStore, UserSummary } from './ports/access-context-store';
import type { SessionStore } from './ports/session-store';
import type { AccessTokenVerifier } from './ports/tokens';
import { isUuid } from './uuid';

/** Who is calling. */
export interface SessionContext {
  readonly userId: string;
  readonly sessionId: string;
}

/**
 * Who is calling, in which cooperative, with which permissions. Every use case
 * inside a cooperative receives it and checks its permission (ADR-004).
 */
export interface CooperativeContext extends SessionContext {
  readonly cooperativeId: string;
  readonly membershipId: string;
  readonly profileName: string;
  readonly isPartner: boolean;
  readonly permissions: readonly Permission[];
}

/**
 * US-ACC-07: a valid signature is not enough. The session must still be open,
 * so a logout or a detected token replay cuts access at once, not when the JWT expires.
 */
export async function authenticateRequest(
  deps: { accessTokens: AccessTokenVerifier; sessions: SessionStore; now: () => Date },
  accessToken: string | undefined,
): Promise<SessionContext> {
  if (!accessToken) throw new UnauthenticatedError();
  const now = deps.now();

  const claims = await deps.accessTokens.verify(accessToken, now);
  if (!claims || !isUuid(claims.sessionId)) throw new UnauthenticatedError();

  const session = await deps.sessions.findById(claims.sessionId);
  if (
    !session ||
    session.userId !== claims.userId ||
    session.revokedAt ||
    now.getTime() >= session.expiresAt.getTime()
  ) {
    throw new UnauthenticatedError();
  }
  return { userId: claims.userId, sessionId: claims.sessionId };
}

/**
 * Permissions are read from the membership on every request, never from the
 * token, so a profile change or a suspension applies to the next request (NFR-ACC-04).
 */
export async function resolveCooperativeContext(
  deps: { contexts: AccessContextStore },
  session: SessionContext,
  cooperativeId: string,
): Promise<CooperativeContext> {
  if (!isUuid(cooperativeId)) throw new CooperativeNotFoundError();

  const membership = await deps.contexts.findActiveMembership(session.userId, cooperativeId);
  if (!membership) throw new CooperativeNotFoundError();

  return { ...session, cooperativeId, ...membership };
}

/** GET /me: the user's data and the cooperatives they can enter (US-ACC-05). */
export async function getMe(
  deps: { contexts: AccessContextStore },
  session: SessionContext,
): Promise<UserSummary> {
  const summary = await deps.contexts.findUserSummary(session.userId);
  // The session exists, so the user does too; this only guards against a race with a deletion.
  if (!summary) throw new UnauthenticatedError();
  return summary;
}
