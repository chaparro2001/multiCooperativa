import { beforeEach, describe, expect, it } from 'vitest';

import { InvitationNotUsableError, WeakPasswordError } from '../domain/errors';
import { acceptInvitation } from './accept-invitation';
import { InvitationNotFoundError, PasswordRequiredError } from './errors';
import type { InvitationStore, PendingInvitation } from './ports/invitation-store';
import { FakeClock, fakeHasher, pendingInvitation, sessionDeps } from './testing/fakes';

const TOKEN = 'token-de-invitacion';

function createStore(invitation: PendingInvitation | null, acceptSucceeds = true) {
  const accepted: Parameters<InvitationStore['accept']>[0][] = [];
  const store: InvitationStore = {
    findByTokenHash: async (hash) => (hash === `sha(${TOKEN})` ? invitation : null),
    accept: async (data) => {
      accepted.push(data);
      return acceptSucceeds;
    },
  };
  return { store, accepted };
}

let clock: FakeClock;

beforeEach(() => {
  clock = new FakeClock(new Date('2026-10-10T10:00:00Z'));
});

function deps(store: InvitationStore) {
  return { ...sessionDeps(clock), invitations: store, hasher: fakeHasher };
}

describe('aceptar invitación (HU-ACC-01)', () => {
  it('Dado una invitación válida, cuando defino una contraseña que cumple la política, entonces la membresía pasa a activa y quedo con la sesión iniciada', async () => {
    const { store, accepted } = createStore(pendingInvitation());
    const d = deps(store);

    const result = await acceptInvitation(d, { token: TOKEN, password: 'una-clave-larga' });

    expect(accepted).toEqual([
      {
        invitationId: 'inv-1',
        membershipId: 'mem-1',
        userId: 'user-1',
        usedAt: clock.now(),
        passwordHash: 'hashed(una-clave-larga)',
      },
    ]);
    expect(result.cooperativeId).toBe('coop-1');
    expect(result.tokens?.accessToken).toMatch(/^jwt\(user-1,/);
    expect(d.sessions.sessions.size).toBe(1);
  });

  it('Dado que ya tengo cuenta, cuando acepto la invitación, entonces se añade la membresía sin pedirme otra contraseña', async () => {
    const { store, accepted } = createStore(
      pendingInvitation({ user: { id: 'user-1', hasPassword: true } }),
    );
    const d = deps(store);

    const result = await acceptInvitation(d, { token: TOKEN });

    expect(accepted[0]?.passwordHash).toBeNull();
    // El enlace por sí solo no abre la cuenta existente: inicia sesión con su contraseña.
    expect(result).toEqual({ cooperativeId: 'coop-1', tokens: null });
    expect(d.sessions.sessions.size).toBe(0);
  });

  it('una cuenta existente no cambia de contraseña aunque se envíe una', async () => {
    const { store, accepted } = createStore(
      pendingInvitation({ user: { id: 'user-1', hasPassword: true } }),
    );

    await acceptInvitation(deps(store), { token: TOKEN, password: 'otra-clave-larga' });

    expect(accepted[0]?.passwordHash).toBeNull();
  });

  it('Dado una invitación caducada, cuando la abro, entonces no se crea ningún acceso', async () => {
    const { store, accepted } = createStore(pendingInvitation({ expiresAt: clock.now() }));

    await expect(
      acceptInvitation(deps(store), { token: TOKEN, password: 'una-clave-larga' }),
    ).rejects.toThrow(InvitationNotUsableError);
    expect(accepted).toEqual([]);
  });

  it('Dado una invitación ya usada, cuando la abro, entonces no se crea ningún acceso', async () => {
    const { store, accepted } = createStore(pendingInvitation({ usedAt: clock.now() }));

    await expect(
      acceptInvitation(deps(store), { token: TOKEN, password: 'una-clave-larga' }),
    ).rejects.toThrow(InvitationNotUsableError);
    expect(accepted).toEqual([]);
  });

  it('un token desconocido falla igual que una invitación inservible', async () => {
    const { store } = createStore(pendingInvitation());

    const error = await acceptInvitation(deps(store), { token: 'otro', password: 'x' }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(InvitationNotFoundError);
    expect((error as InvitationNotFoundError).code).toBe(new InvitationNotUsableError('used').code);
  });

  it('si otra petición la usa a la vez, solo una gana (RN-ACC-10)', async () => {
    const { store } = createStore(pendingInvitation(), false);
    const d = deps(store);

    await expect(
      acceptInvitation(d, { token: TOKEN, password: 'una-clave-larga' }),
    ).rejects.toThrow(InvitationNotUsableError);
    expect(d.sessions.sessions.size).toBe(0);
  });

  it('un usuario nuevo necesita contraseña', async () => {
    const { store } = createStore(pendingInvitation());

    await expect(acceptInvitation(deps(store), { token: TOKEN })).rejects.toThrow(
      PasswordRequiredError,
    );
  });

  it('la contraseña cumple la política (RNF-ACC-01)', async () => {
    const { store, accepted } = createStore(pendingInvitation());

    await expect(
      acceptInvitation(deps(store), { token: TOKEN, password: 'corta' }),
    ).rejects.toThrow(WeakPasswordError);
    expect(accepted).toEqual([]);
  });
});
