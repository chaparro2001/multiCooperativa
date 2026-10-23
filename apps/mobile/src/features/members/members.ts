import type { Member, MembershipStatus } from '@multicooperativa/contracts';

export const STATUS_FILTERS = ['all', 'active', 'invited', 'suspended'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export function statusTone(status: MembershipStatus): 'info' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'active':
      return 'info';
    case 'invited':
      return 'warning';
    case 'suspended':
    case 'removed':
      return 'danger';
  }
}

export interface MemberActions {
  changeProfile: boolean;
  suspend: boolean;
  reactivate: boolean;
  resendInvitation: boolean;
  /** ADR-025: the partner's NIF. */
  editNif: boolean;
}

/**
 * What the screen offers on a member. The server decides (BR-ACC-07, BR-ACC-08, transitions);
 * this only avoids offering what it would reject: nobody edits their own membership, a pending
 * invitation can only be resent and a removed membership cannot change.
 */
export function memberActions(
  member: Member,
  currentUserId: string | undefined,
  canManage: boolean,
): MemberActions {
  const none = {
    changeProfile: false,
    suspend: false,
    reactivate: false,
    resendInvitation: false,
    editNif: false,
  };
  if (!canManage || member.userId === currentUserId) return none;
  switch (member.status) {
    case 'active':
      return { ...none, changeProfile: true, suspend: true, editNif: member.isPartner };
    case 'suspended':
      return { ...none, changeProfile: true, reactivate: true, editNif: member.isPartner };
    case 'invited':
      return { ...none, changeProfile: true, resendInvitation: true, editNif: member.isPartner };
    case 'removed':
      return none;
  }
}
