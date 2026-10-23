import { beforeEach, describe, expect, it } from 'vitest';

import {
  InvalidMemberNifError,
  InvalidMembershipTransitionError,
  LastAdminError,
  ModuleAccessDeniedError,
  SelfModificationError,
} from '../domain/errors';
import { PREDEFINED_PROFILES } from '../domain/predefined-profiles';
import {
  InvitationNotPendingError,
  MemberAlreadyExistsError,
  MemberNifTakenError,
  MemberNotFoundError,
  ProfileNotFoundError,
} from './errors';
import {
  changeMember,
  getMember,
  inviteMember,
  listMembers,
  type MemberDeps,
  removeMember,
  resendInvitation,
} from './members';
import type { InvitationSender } from './ports/invitation-sender';
import type { MemberRecord } from './ports/member-store';
import type { CooperativeContext } from './request-context';
import { FakeClock, InMemoryMemberStore } from './testing/fakes';

const PAGE = { limit: 30 };
const COOP = '40000000-0000-4000-8000-000000000001';
const UNKNOWN = '20000000-0000-4000-8000-999999999999';

const permissionsOf = (name: string) =>
  PREDEFINED_PROFILES.find((profile) => profile.name === name)!.permissions;

function contextFor(member: MemberRecord): CooperativeContext {
  return {
    userId: member.userId,
    sessionId: 'session-1',
    cooperativeId: COOP,
    membershipId: member.membershipId,
    profileName: member.profileName,
    isPartner: member.isPartner,
    permissions: permissionsOf(member.profileName),
  };
}

let clock: FakeClock;
let store: InMemoryMemberStore;
let sent: Parameters<InvitationSender['send']>[0][];
let deps: MemberDeps;
let admin: MemberRecord;
let ctx: CooperativeContext;

beforeEach(() => {
  clock = new FakeClock(new Date('2026-10-10T10:00:00Z'));
  store = new InMemoryMemberStore();
  sent = [];
  let secret = 0;
  deps = {
    members: store,
    secrets: { generate: () => `token-${++secret}`, hash: (token) => `sha(${token})` },
    invitationSender: { send: async (invitation) => void sent.push(invitation) },
    now: clock.now,
  };
  admin = store.addMember('admin@campo.es', 'Administrador');
  ctx = contextFor(admin);
});

const invite = (email: string, profile = 'Socio') =>
  inviteMember(deps, ctx, {
    email,
    name: 'Grace',
    profileId: store.profile(profile).id,
    isPartner: true,
  });

describe('member management permissions (US-ACC-07)', () => {
  it('without "Users and profiles · manage" it is denied before reading anything', async () => {
    const gestor = contextFor(store.addMember('manager@campo.es', 'Gestor'));

    await expect(listMembers(deps, gestor, {}, PAGE)).rejects.toThrow(ModuleAccessDeniedError);
    await expect(
      inviteMember(deps, gestor, {
        email: 'x@campo.es',
        name: 'X',
        profileId: store.profile('Socio').id,
        isPartner: false,
      }),
    ).rejects.toThrow(ModuleAccessDeniedError);
    expect(store.audit).toEqual([]);
  });
});

describe('list members (US-ACC-10)', () => {
  it('pages by name with a cursor, filters by search and status, and never lists removed members', async () => {
    store.addMember('b@campo.es', 'Socio');
    store.addMember('c@campo.es', 'Socio', 'suspended');
    store.addMember('d@campo.es', 'Socio', 'removed');

    const first = await listMembers(deps, ctx, {}, { limit: 2 });
    const second = await listMembers(deps, ctx, {}, { limit: 2, before: first.nextCursor! });

    expect(first.items.map((m) => m.email)).toEqual(['admin@campo.es', 'b@campo.es']);
    expect(second.items.map((m) => m.email)).toEqual(['c@campo.es']);
    expect(second.nextCursor).toBeNull();

    const suspended = await listMembers(deps, ctx, { status: 'suspended' }, PAGE);
    expect(suspended.items.map((m) => m.email)).toEqual(['c@campo.es']);
    const found = await listMembers(deps, ctx, { search: 'ADMIN' }, PAGE);
    expect(found.items.map((m) => m.email)).toEqual(['admin@campo.es']);
  });

  it('a member that has left, an unknown id or a malformed one do not exist', async () => {
    const gone = store.addMember('gone@campo.es', 'Socio', 'removed');
    await expect(getMember(deps, ctx, gone.membershipId)).rejects.toThrow(MemberNotFoundError);
    await expect(getMember(deps, ctx, UNKNOWN)).rejects.toThrow(MemberNotFoundError);
    await expect(getMember(deps, ctx, 'nope')).rejects.toThrow(MemberNotFoundError);
    expect((await getMember(deps, ctx, admin.membershipId)).email).toBe('admin@campo.es');
  });
});

describe('invite (US-ACC-08)', () => {
  it('Given an email without a membership, when I invite it, then an invited membership is created and the invitation is sent', async () => {
    const { membershipId } = await invite(' Grace@Campo.ES ');

    const member = store.members.find((m) => m.membershipId === membershipId)!;
    expect(member).toMatchObject({ email: 'grace@campo.es', status: 'invited', isPartner: true });
    expect(store.invitations.get(membershipId)).toEqual({
      tokenHash: 'sha(token-1)',
      expiresAt: new Date('2026-10-17T10:00:00Z'),
    });
    expect(sent).toEqual([
      {
        email: 'grace@campo.es',
        cooperativeId: COOP,
        token: 'token-1',
        expiresAt: new Date('2026-10-17T10:00:00Z'),
      },
    ]);
    expect(store.audit).toEqual([
      {
        actorUserId: admin.userId,
        targetUserId: member.userId,
        action: 'member.invited',
        detail: { profile: 'Socio', isPartner: true },
      },
    ]);
  });

  it('Given an email that already has a membership, when I invite it, then I am told and nothing is duplicated', async () => {
    await invite('grace@campo.es');

    await expect(invite('grace@campo.es')).rejects.toThrow(MemberAlreadyExistsError);
    expect(store.members).toHaveLength(2);
    expect(sent).toHaveLength(1);
  });

  it('Given a removed member, when they are given access again, then a new membership is created', async () => {
    const old = store.addMember('grace@campo.es', 'Socio', 'removed');

    const { membershipId } = await invite('grace@campo.es');

    expect(membershipId).not.toBe(old.membershipId);
    expect(store.members.find((m) => m.membershipId === membershipId)?.userId).toBe(old.userId);
  });

  it('a profile that does not belong to the cooperative is rejected', async () => {
    await expect(
      inviteMember(deps, ctx, {
        email: 'x@campo.es',
        name: 'X',
        profileId: UNKNOWN,
        isPartner: false,
      }),
    ).rejects.toThrow(ProfileNotFoundError);
    await expect(
      inviteMember(deps, ctx, {
        email: 'x@campo.es',
        name: 'X',
        profileId: 'abc',
        isPartner: false,
      }),
    ).rejects.toThrow(ProfileNotFoundError);
  });
});

describe('administrator delivery (ADR-016)', () => {
  it('returns the expiry and, when the sender produces one, the link; nothing otherwise', async () => {
    const plain = await invite('plain@campo.es');
    expect(plain).toMatchObject({ expiresAt: new Date('2026-10-17T10:00:00Z') });
    expect(plain).not.toHaveProperty('invitationUrl');

    deps.invitationSender = {
      send: async ({ token }) => ({ invitationUrl: `https://w/i?token=${token}` }),
    };
    const linked = await invite('linked@campo.es');
    expect(linked.invitationUrl).toBe('https://w/i?token=token-2');

    const resent = await resendInvitation(deps, ctx, linked.membershipId);
    expect(resent).toEqual({
      expiresAt: new Date('2026-10-17T10:00:00Z'),
      invitationUrl: 'https://w/i?token=token-3',
    });
  });
});

describe('resend invitation (US-ACC-08)', () => {
  it('Given a pending invitation, when I resend it, then the previous one is invalidated and a new one is issued', async () => {
    const { membershipId } = await invite('grace@campo.es');
    clock.advanceMinutes(60);

    await resendInvitation(deps, ctx, membershipId);

    expect(store.invitations.get(membershipId)).toEqual({
      tokenHash: 'sha(token-2)',
      expiresAt: new Date('2026-10-17T11:00:00Z'),
    });
    expect(sent.map((s) => s.token)).toEqual(['token-1', 'token-2']);
    expect(store.audit.at(-1)?.action).toBe('member.invitation_resent');
  });

  it('it is not resent to whoever already accepted', async () => {
    const member = store.addMember('grace@campo.es', 'Socio');

    await expect(resendInvitation(deps, ctx, member.membershipId)).rejects.toThrow(
      InvitationNotPendingError,
    );
    expect(sent).toEqual([]);
  });
});

describe('change profile (US-ACC-09)', () => {
  it('Given an active member, when I assign them another profile, then they have the new one and it is audited', async () => {
    const member = store.addMember('grace@campo.es', 'Socio');

    const updated = await changeMember(deps, ctx, member.membershipId, {
      profileId: store.profile('Gestor').id,
    });

    expect(updated.profileName).toBe('Gestor');
    expect(store.audit.at(-1)).toEqual({
      actorUserId: admin.userId,
      targetUserId: member.userId,
      action: 'member.profile_changed',
      detail: { before: { profile: 'Socio' }, after: { profile: 'Gestor' } },
    });
  });

  it('Given my own membership, when I try to change my profile, then it is rejected', async () => {
    await expect(
      changeMember(deps, ctx, admin.membershipId, { profileId: store.profile('Socio').id }),
    ).rejects.toThrow(SelfModificationError);
    expect(store.audit).toEqual([]);
  });

  it('Given a member of another cooperative (or a nonexistent one), when I modify them, then they are not found', async () => {
    await expect(
      changeMember(deps, ctx, UNKNOWN, { profileId: store.profile('Socio').id }),
    ).rejects.toThrow(MemberNotFoundError);
    await expect(changeMember(deps, ctx, 'abc', { status: 'suspended' })).rejects.toThrow(
      MemberNotFoundError,
    );
  });

  it('does not leave the cooperative without an active administrator (BR-ACC-07)', async () => {
    // Another administrator removes the profile of the only administrator who would remain active.
    const other = store.addMember('other@campo.es', 'Administrador');
    admin.status = 'suspended';

    await expect(
      changeMember(deps, contextFor(admin), other.membershipId, {
        profileId: store.profile('Socio').id,
      }),
    ).rejects.toThrow(LastAdminError);
  });

  it('a removed member cannot change profile', async () => {
    const member = store.addMember('grace@campo.es', 'Socio', 'removed');

    await expect(
      changeMember(deps, ctx, member.membershipId, { profileId: store.profile('Gestor').id }),
    ).rejects.toThrow(InvalidMembershipTransitionError);
  });
});

describe('suspend, reactivate and remove (US-ACC-10)', () => {
  it('Given an active member, when I suspend them, then they are suspended', async () => {
    const member = store.addMember('grace@campo.es', 'Socio');

    const updated = await changeMember(deps, ctx, member.membershipId, { status: 'suspended' });

    expect(updated.status).toBe('suspended');
    expect(store.audit.at(-1)).toMatchObject({
      action: 'member.suspended',
      detail: { before: { status: 'active' }, after: { status: 'suspended' } },
    });
  });

  it('Given a suspended member, when I reactivate them, then they regain access with their profile', async () => {
    const member = store.addMember('grace@campo.es', 'Gestor', 'suspended');

    const updated = await changeMember(deps, ctx, member.membershipId, { status: 'active' });

    expect(updated).toMatchObject({ status: 'active', profileName: 'Gestor' });
    expect(store.audit.at(-1)?.action).toBe('member.reactivated');
  });

  it('someone who is not suspended cannot be reactivated', async () => {
    const member = store.addMember('grace@campo.es', 'Socio', 'invited');

    await expect(
      changeMember(deps, ctx, member.membershipId, { status: 'active' }),
    ).rejects.toThrow(InvalidMembershipTransitionError);
  });

  it('Given an active or suspended member, when I remove them, then they no longer appear in the list', async () => {
    const active = store.addMember('grace@campo.es', 'Socio');
    const suspended = store.addMember('ada@campo.es', 'Socio', 'suspended');

    await removeMember(deps, ctx, active.membershipId);
    await removeMember(deps, ctx, suspended.membershipId);

    const listed = (await listMembers(deps, ctx, {}, PAGE)).items.map((m) => m.email);
    expect(listed).toEqual(['admin@campo.es']);
    expect(store.audit.map((a) => a.action)).toEqual(['member.removed', 'member.removed']);
  });

  it('removal is final: it cannot be reactivated', async () => {
    const member = store.addMember('grace@campo.es', 'Socio');
    await removeMember(deps, ctx, member.membershipId);

    await expect(
      changeMember(deps, ctx, member.membershipId, { status: 'active' }),
    ).rejects.toThrow(InvalidMembershipTransitionError);
  });

  it('Given my own membership, when I try to suspend or remove myself, then it is rejected', async () => {
    await expect(
      changeMember(deps, ctx, admin.membershipId, { status: 'suspended' }),
    ).rejects.toThrow(SelfModificationError);
    await expect(removeMember(deps, ctx, admin.membershipId)).rejects.toThrow(
      SelfModificationError,
    );
  });

  it('the last active administrator is neither suspended nor removed (BR-ACC-07)', async () => {
    const other = store.addMember('other@campo.es', 'Administrador');
    admin.status = 'suspended';
    const actor = contextFor(admin);

    await expect(
      changeMember(deps, actor, other.membershipId, { status: 'suspended' }),
    ).rejects.toThrow(LastAdminError);
    await expect(removeMember(deps, actor, other.membershipId)).rejects.toThrow(LastAdminError);
  });
});

describe('partner NIF (ADR-025, BR-ACC-18)', () => {
  const inviteWithNif = (email: string, nif: string | null) =>
    inviteMember(deps, ctx, {
      email,
      name: 'Grace',
      profileId: store.profile('Socio').id,
      isPartner: true,
      nif,
    });

  it('US-ACC-08: an invitation stores the NIF normalized', async () => {
    await inviteWithNif('grace@campo.es', ' 12.345.678-z ');

    expect(store.members.find((m) => m.email === 'grace@campo.es')!.nif).toBe('12345678Z');
  });

  it('US-ACC-08: a NIF with a wrong control character is rejected and nothing is created', async () => {
    await expect(inviteWithNif('grace@campo.es', '12345678A')).rejects.toBeInstanceOf(
      InvalidMemberNifError,
    );
    expect(store.members.some((m) => m.email === 'grace@campo.es')).toBe(false);
    expect(sent).toEqual([]);
  });

  it('BR-ACC-18: two live members of the cooperative cannot share a NIF', async () => {
    await inviteWithNif('grace@campo.es', '12345678Z');

    await expect(inviteWithNif('ada@campo.es', '12345678z')).rejects.toBeInstanceOf(
      MemberNifTakenError,
    );
  });

  it('BR-ACC-18: a removed member does not hold its NIF', async () => {
    const first = await inviteWithNif('grace@campo.es', '12345678Z');
    const granted = store.members.find((m) => m.membershipId === first.membershipId)!;
    granted.status = 'removed';

    await expect(inviteWithNif('ada@campo.es', '12345678Z')).resolves.toBeDefined();
  });

  it('US-ACC-09: the NIF is set and cleared by a change, and audited without its value', async () => {
    const member = store.addMember('grace@campo.es', 'Socio');

    const set = await changeMember(deps, ctx, member.membershipId, { nif: '12345678z' });
    const cleared = await changeMember(deps, ctx, member.membershipId, { nif: null });

    expect(set.nif).toBe('12345678Z');
    expect(cleared.nif).toBeNull();
    expect(JSON.stringify(store.audit)).not.toContain('12345678');
    expect(store.audit.map((event) => event.action)).toContain('member.nif_changed');
  });

  it('BR-ACC-18: changing to a NIF another member holds is refused; invalid ones too', async () => {
    const one = store.addMember('grace@campo.es', 'Socio');
    const two = store.addMember('ada@campo.es', 'Socio');
    await changeMember(deps, ctx, one.membershipId, { nif: '12345678Z' });

    await expect(
      changeMember(deps, ctx, two.membershipId, { nif: '12345678Z' }),
    ).rejects.toBeInstanceOf(MemberNifTakenError);
    await expect(
      changeMember(deps, ctx, two.membershipId, { nif: '12345678A' }),
    ).rejects.toBeInstanceOf(InvalidMemberNifError);
  });

  it('BR-ACC-08: nobody sets their own NIF, and the change needs user management', async () => {
    await expect(
      changeMember(deps, ctx, admin.membershipId, { nif: '12345678Z' }),
    ).rejects.toBeInstanceOf(SelfModificationError);
    const socio = store.addMember('grace@campo.es', 'Socio');
    await expect(
      changeMember(deps, contextFor(socio), admin.membershipId, { nif: '12345678Z' }),
    ).rejects.toBeInstanceOf(ModuleAccessDeniedError);
  });
});
