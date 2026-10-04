import { beforeEach, describe, expect, it } from 'vitest';

import {
  InvalidMembershipTransitionError,
  LastAdminError,
  ModuleAccessDeniedError,
  SelfModificationError,
} from '../domain/errors';
import { PREDEFINED_PROFILES } from '../domain/predefined-profiles';
import {
  InvitationNotPendingError,
  MemberAlreadyExistsError,
  MemberNotFoundError,
  ProfileNotFoundError,
} from './errors';
import {
  changeMember,
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

describe('permisos de gestión de miembros (HU-ACC-07)', () => {
  it('sin «Usuarios y perfiles · gestión» se deniega antes de leer nada', async () => {
    const gestor = contextFor(store.addMember('gestor@campo.es', 'Gestor'));

    await expect(listMembers(deps, gestor)).rejects.toThrow(ModuleAccessDeniedError);
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

describe('invitar (HU-ACC-08)', () => {
  it('Dado un email sin membresía, cuando lo invito, entonces se crea una membresía invitada y se envía la invitación', async () => {
    const { membershipId } = await invite(' Grace@Campo.ES ');

    const member = store.members.find((m) => m.membershipId === membershipId)!;
    expect(member).toMatchObject({ email: 'grace@campo.es', status: 'invitada', isPartner: true });
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

  it('Dado un email que ya tiene membresía, cuando lo invito, entonces se me informa y no se duplica', async () => {
    await invite('grace@campo.es');

    await expect(invite('grace@campo.es')).rejects.toThrow(MemberAlreadyExistsError);
    expect(store.members).toHaveLength(2);
    expect(sent).toHaveLength(1);
  });

  it('Dado un miembro dado de baja, cuando se le vuelve a dar acceso, entonces se crea una membresía nueva', async () => {
    const old = store.addMember('grace@campo.es', 'Socio', 'baja');

    const { membershipId } = await invite('grace@campo.es');

    expect(membershipId).not.toBe(old.membershipId);
    expect(store.members.find((m) => m.membershipId === membershipId)?.userId).toBe(old.userId);
  });

  it('un perfil que no es de la cooperativa se rechaza', async () => {
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

describe('reenviar invitación (HU-ACC-08)', () => {
  it('Dado una invitación pendiente, cuando la reenvío, entonces la anterior queda invalidada y se emite una nueva', async () => {
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

  it('no se reenvía a quien ya aceptó', async () => {
    const member = store.addMember('grace@campo.es', 'Socio');

    await expect(resendInvitation(deps, ctx, member.membershipId)).rejects.toThrow(
      InvitationNotPendingError,
    );
    expect(sent).toEqual([]);
  });
});

describe('cambiar perfil (HU-ACC-09)', () => {
  it('Dado un miembro activo, cuando le asigno otro perfil, entonces queda con el nuevo y se audita', async () => {
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

  it('Dado mi propia membresía, cuando intento cambiar mi perfil, entonces se rechaza', async () => {
    await expect(
      changeMember(deps, ctx, admin.membershipId, { profileId: store.profile('Socio').id }),
    ).rejects.toThrow(SelfModificationError);
    expect(store.audit).toEqual([]);
  });

  it('Dado un miembro de otra cooperativa (o inexistente), cuando lo modifico, entonces no se encuentra', async () => {
    await expect(
      changeMember(deps, ctx, UNKNOWN, { profileId: store.profile('Socio').id }),
    ).rejects.toThrow(MemberNotFoundError);
    await expect(changeMember(deps, ctx, 'abc', { status: 'suspendida' })).rejects.toThrow(
      MemberNotFoundError,
    );
  });

  it('no deja la cooperativa sin administrador activo (RN-ACC-07)', async () => {
    // Otro administrador quita el perfil al único administrador que quedaría activo.
    const other = store.addMember('otro@campo.es', 'Administrador');
    admin.status = 'suspendida';

    await expect(
      changeMember(deps, contextFor(admin), other.membershipId, {
        profileId: store.profile('Socio').id,
      }),
    ).rejects.toThrow(LastAdminError);
  });

  it('un miembro dado de baja no cambia de perfil', async () => {
    const member = store.addMember('grace@campo.es', 'Socio', 'baja');

    await expect(
      changeMember(deps, ctx, member.membershipId, { profileId: store.profile('Gestor').id }),
    ).rejects.toThrow(InvalidMembershipTransitionError);
  });
});

describe('suspender, reactivar y dar de baja (HU-ACC-10)', () => {
  it('Dado un miembro activo, cuando lo suspendo, entonces queda suspendido', async () => {
    const member = store.addMember('grace@campo.es', 'Socio');

    const updated = await changeMember(deps, ctx, member.membershipId, { status: 'suspendida' });

    expect(updated.status).toBe('suspendida');
    expect(store.audit.at(-1)).toMatchObject({
      action: 'member.suspended',
      detail: { before: { status: 'activa' }, after: { status: 'suspendida' } },
    });
  });

  it('Dado un miembro suspendido, cuando lo reactivo, entonces recupera el acceso con su perfil', async () => {
    const member = store.addMember('grace@campo.es', 'Gestor', 'suspendida');

    const updated = await changeMember(deps, ctx, member.membershipId, { status: 'activa' });

    expect(updated).toMatchObject({ status: 'activa', profileName: 'Gestor' });
    expect(store.audit.at(-1)?.action).toBe('member.reactivated');
  });

  it('no se puede reactivar a quien no está suspendido', async () => {
    const member = store.addMember('grace@campo.es', 'Socio', 'invitada');

    await expect(
      changeMember(deps, ctx, member.membershipId, { status: 'activa' }),
    ).rejects.toThrow(InvalidMembershipTransitionError);
  });

  it('Dado un miembro activo o suspendido, cuando lo doy de baja, entonces deja de aparecer en el listado', async () => {
    const active = store.addMember('grace@campo.es', 'Socio');
    const suspended = store.addMember('ada@campo.es', 'Socio', 'suspendida');

    await removeMember(deps, ctx, active.membershipId);
    await removeMember(deps, ctx, suspended.membershipId);

    const listed = (await listMembers(deps, ctx)).map((m) => m.email);
    expect(listed).toEqual(['admin@campo.es']);
    expect(store.audit.map((a) => a.action)).toEqual(['member.removed', 'member.removed']);
  });

  it('la baja es definitiva: no se puede reactivar', async () => {
    const member = store.addMember('grace@campo.es', 'Socio');
    await removeMember(deps, ctx, member.membershipId);

    await expect(
      changeMember(deps, ctx, member.membershipId, { status: 'activa' }),
    ).rejects.toThrow(InvalidMembershipTransitionError);
  });

  it('Dado mi propia membresía, cuando intento suspenderme o darme de baja, entonces se rechaza', async () => {
    await expect(
      changeMember(deps, ctx, admin.membershipId, { status: 'suspendida' }),
    ).rejects.toThrow(SelfModificationError);
    await expect(removeMember(deps, ctx, admin.membershipId)).rejects.toThrow(
      SelfModificationError,
    );
  });

  it('no se suspende ni se da de baja al último administrador activo (RN-ACC-07)', async () => {
    const other = store.addMember('otro@campo.es', 'Administrador');
    admin.status = 'suspendida';
    const actor = contextFor(admin);

    await expect(
      changeMember(deps, actor, other.membershipId, { status: 'suspendida' }),
    ).rejects.toThrow(LastAdminError);
    await expect(removeMember(deps, actor, other.membershipId)).rejects.toThrow(LastAdminError);
  });
});
