import { InvalidMembershipTransitionError } from './errors';

export const MEMBERSHIP_STATUSES = ['invitada', 'activa', 'suspendida', 'baja'] as const;
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
      `No se puede ${action} una membresía en estado ${membership.status}.`,
    );
  }
  return { ...membership, status: to };
}

export const activate = <T extends WithStatus>(membership: T): T =>
  transition(membership, 'activar', ['invitada'], 'activa');

export const suspend = <T extends WithStatus>(membership: T): T =>
  transition(membership, 'suspender', ['activa'], 'suspendida');

export const reactivate = <T extends WithStatus>(membership: T): T =>
  transition(membership, 'reactivar', ['suspendida'], 'activa');

/** Definitive: "baja" is a final state and never deletes data (RN-ACC-14). */
export const remove = <T extends WithStatus>(membership: T): T =>
  transition(membership, 'dar de baja', ['activa', 'suspendida'], 'baja');

/** Only an active membership grants any access (RN-ACC-09). */
export function grantsAccess(membership: WithStatus): boolean {
  return membership.status === 'activa';
}

/** Voting depends on being a partner, not on the profile (RN-ACC-06). */
export function canVote(membership: WithStatus & { readonly isPartner: boolean }): boolean {
  return grantsAccess(membership) && membership.isPartner;
}
