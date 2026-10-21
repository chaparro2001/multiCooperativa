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

/** Case and accent insensitive, so "jose" finds "José". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Search by name or email plus a status filter; sorted by name. */
export function filterMembers(members: Member[], search: string, status: StatusFilter): Member[] {
  const needle = normalize(search);
  return members
    .filter((member) => status === 'all' || member.status === status)
    .filter(
      (member) =>
        needle === '' ||
        normalize(member.name).includes(needle) ||
        normalize(member.email).includes(needle),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface MemberActions {
  changeProfile: boolean;
  suspend: boolean;
  reactivate: boolean;
  resendInvitation: boolean;
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
  };
  if (!canManage || member.userId === currentUserId) return none;
  switch (member.status) {
    case 'active':
      return { ...none, changeProfile: true, suspend: true };
    case 'suspended':
      return { ...none, changeProfile: true, reactivate: true };
    case 'invited':
      return { ...none, changeProfile: true, resendInvitation: true };
    case 'removed':
      return none;
  }
}
