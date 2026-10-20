import { InvalidMembershipTransitionError } from './errors';

export const MEMBERSHIP_STATUSES = ['invited', 'active', 'suspended', 'removed'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

interface WithStatus {
  readonly status: MembershipStatus;
}

function transition<T extends WithStatus>(
  membership: T,
  action: string,
  from: readonly MembershipStatus[],
  to: MembershipStatus,
): T {
  if (!from.includes(membership.status)) {
    throw new InvalidMembershipTransitionError(
      `Cannot ${action} a membership in status ${membership.status}.`,
    );
  }
  return { ...membership, status: to };
}

export const activate = <T extends WithStatus>(membership: T): T =>
  transition(membership, 'activate', ['invited'], 'active');

export const suspend = <T extends WithStatus>(membership: T): T =>
  transition(membership, 'suspend', ['active'], 'suspended');

export const reactivate = <T extends WithStatus>(membership: T): T =>
  transition(membership, 'reactivate', ['suspended'], 'active');

/** Definitive: "removed" is a final state and never deletes data (BR-ACC-14). */
export const remove = <T extends WithStatus>(membership: T): T =>
  transition(membership, 'remove', ['active', 'suspended'], 'removed');

/** Only an active membership grants any access (BR-ACC-09). */
export function grantsAccess(membership: WithStatus): boolean {
  return membership.status === 'active';
}

/** Voting depends on being a partner, not on the profile (BR-ACC-06). */
export function canVote(membership: WithStatus & { readonly isPartner: boolean }): boolean {
  return grantsAccess(membership) && membership.isPartner;
}
