import type { Member } from '@multicooperativa/contracts';
import { describe, expect, it } from 'vitest';

import { memberActions, statusTone } from './members';

const base: Member = {
  membershipId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-0000000000a1',
  email: 'jose@example.test',
  name: 'José Pérez',
  profileId: '00000000-0000-4000-8000-0000000000b1',
  profileName: 'Socio',
  status: 'active',
  isPartner: true,
  partnerNumber: null,
};
const member = (patch: Partial<Member>): Member => ({ ...base, ...patch });

describe('member list (US-ACC-10)', () => {
  it('colours each status', () => {
    expect(statusTone('active')).toBe('info');
    expect(statusTone('invited')).toBe('warning');
    expect(statusTone('suspended')).toBe('danger');
  });
});

describe('member actions (US-ACC-09, US-ACC-10, BR-ACC-08)', () => {
  const other = '00000000-0000-4000-8000-0000000000ff';
  const none = {
    changeProfile: false,
    suspend: false,
    reactivate: false,
    resendInvitation: false,
  };

  it('offers profile change and suspension on an active member', () => {
    expect(memberActions(base, other, true)).toEqual({
      ...none,
      changeProfile: true,
      suspend: true,
    });
  });

  it('offers reactivation on a suspended member and resending on an invited one', () => {
    expect(memberActions(member({ status: 'suspended' }), other, true).reactivate).toBe(true);
    expect(memberActions(member({ status: 'invited' }), other, true).resendInvitation).toBe(true);
    expect(memberActions(member({ status: 'invited' }), other, true).suspend).toBe(false);
  });

  it('offers nothing on the own membership, without manage level or on a removed one', () => {
    expect(memberActions(base, base.userId, true)).toEqual(none);
    expect(memberActions(base, other, false)).toEqual(none);
    expect(memberActions(member({ status: 'removed' }), other, true)).toEqual(none);
  });
});
