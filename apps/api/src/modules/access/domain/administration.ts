import { LastAdminError, SelfModificationError } from './errors';

/** BR-ACC-08: an administrator cannot modify or suspend their own membership. */
export function assertNotSelf(actorMembershipId: string, targetMembershipId: string): void {
  if (actorMembershipId === targetMembershipId) {
    throw new SelfModificationError();
  }
}

/**
 * BR-ACC-07: guards any change that takes admin rights away from a member
 * (profile change, suspension or removal).
 */
export function assertKeepsAnAdmin(input: {
  targetIsActiveAdmin: boolean;
  activeAdminCount: number;
}): void {
  if (input.targetIsActiveAdmin && input.activeAdminCount <= 1) {
    throw new LastAdminError();
  }
}
