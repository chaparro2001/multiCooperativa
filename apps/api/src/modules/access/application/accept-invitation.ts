import { InvitationNotUsableError } from '../domain/errors';
import { useInvitation } from '../domain/invitation';
import { activate } from '../domain/membership';
import { assertPasswordPolicy } from '../domain/password-policy';
import { InvitationNotFoundError, PasswordRequiredError } from './errors';
import type { InvitationStore } from './ports/invitation-store';
import type { PasswordHasher } from './ports/password-hasher';
import { type AuthTokens, type SessionDeps, startSession } from './session-tokens';

export interface AcceptInvitationInput {
  token: string;
  /** Only for a new user; an existing user keeps their password. */
  password?: string;
}

export interface AcceptInvitationResult {
  cooperativeId: string;
  /**
   * A new user who has just set their password starts a session. An existing
   * user does not: the link alone must not open their account, so they log in.
   */
  tokens: AuthTokens | null;
}

/** US-ACC-01. */
export async function acceptInvitation(
  deps: SessionDeps & { invitations: InvitationStore; hasher: PasswordHasher },
  input: AcceptInvitationInput,
): Promise<AcceptInvitationResult> {
  const now = deps.now();
  const invitation = await deps.invitations.findByTokenHash(deps.secrets.hash(input.token));
  if (!invitation) throw new InvitationNotFoundError();

  // Both throw when the invitation or the membership no longer allow it (BR-ACC-10).
  useInvitation(invitation, now);
  activate({ status: invitation.membershipStatus });

  let passwordHash: string | null = null;
  if (!invitation.user.hasPassword) {
    if (!input.password) throw new PasswordRequiredError();
    assertPasswordPolicy(input.password);
    passwordHash = await deps.hasher.hash(input.password);
  }

  const accepted = await deps.invitations.accept({
    invitationId: invitation.id,
    membershipId: invitation.membershipId,
    userId: invitation.user.id,
    usedAt: now,
    passwordHash,
  });
  if (!accepted) throw new InvitationNotUsableError('used');

  return {
    cooperativeId: invitation.cooperativeId,
    tokens: passwordHash ? await startSession(deps, invitation.user.id, now) : null,
  };
}
