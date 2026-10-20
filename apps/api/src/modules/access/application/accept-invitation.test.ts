import { beforeEach, describe, expect, it } from 'vitest';

import { InvitationNotUsableError, WeakPasswordError } from '../domain/errors';
import { acceptInvitation } from './accept-invitation';
import { InvitationNotFoundError, PasswordRequiredError } from './errors';
import type { InvitationStore, PendingInvitation } from './ports/invitation-store';
import { FakeClock, fakeHasher, pendingInvitation, sessionDeps } from './testing/fakes';

const TOKEN = 'invitation-token';

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

describe('accept invitation (US-ACC-01)', () => {
  it('Given a valid invitation, when I set a password that meets the policy, then the membership becomes active and I am logged in', async () => {
    const { store, accepted } = createStore(pendingInvitation());
    const d = deps(store);

    const result = await acceptInvitation(d, { token: TOKEN, password: 'a-long-password' });

    expect(accepted).toEqual([
      {
        invitationId: 'inv-1',
        membershipId: 'mem-1',
        userId: 'user-1',
        usedAt: clock.now(),
        passwordHash: 'hashed(a-long-password)',
      },
    ]);
    expect(result.cooperativeId).toBe('coop-1');
    expect(result.tokens?.accessToken).toMatch(/^jwt\(user-1,/);
    expect(d.sessions.sessions.size).toBe(1);
  });

  it('Given I already have an account, when I accept the invitation, then the membership is added without asking for another password', async () => {
    const { store, accepted } = createStore(
      pendingInvitation({ user: { id: 'user-1', hasPassword: true } }),
    );
    const d = deps(store);

    const result = await acceptInvitation(d, { token: TOKEN });

    expect(accepted[0]?.passwordHash).toBeNull();
    // The link alone does not open the existing account: the user logs in with their password.
    expect(result).toEqual({ cooperativeId: 'coop-1', tokens: null });
    expect(d.sessions.sessions.size).toBe(0);
  });

  it('an existing account keeps its password even if one is sent', async () => {
    const { store, accepted } = createStore(
      pendingInvitation({ user: { id: 'user-1', hasPassword: true } }),
    );

    await acceptInvitation(deps(store), { token: TOKEN, password: 'otra-clave-larga' });

    expect(accepted[0]?.passwordHash).toBeNull();
  });

  it('Given an expired invitation, when I open it, then no access is created', async () => {
    const { store, accepted } = createStore(pendingInvitation({ expiresAt: clock.now() }));

    await expect(
      acceptInvitation(deps(store), { token: TOKEN, password: 'a-long-password' }),
    ).rejects.toThrow(InvitationNotUsableError);
    expect(accepted).toEqual([]);
  });

  it('Given an already used invitation, when I open it, then no access is created', async () => {
    const { store, accepted } = createStore(pendingInvitation({ usedAt: clock.now() }));

    await expect(
      acceptInvitation(deps(store), { token: TOKEN, password: 'a-long-password' }),
    ).rejects.toThrow(InvitationNotUsableError);
    expect(accepted).toEqual([]);
  });

  it('an unknown token fails the same as an unusable invitation', async () => {
    const { store } = createStore(pendingInvitation());

    const error = await acceptInvitation(deps(store), { token: 'otro', password: 'x' }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(InvitationNotFoundError);
    expect((error as InvitationNotFoundError).code).toBe(new InvitationNotUsableError('used').code);
  });

  it('if another request uses it at the same time, only one wins (BR-ACC-10)', async () => {
    const { store } = createStore(pendingInvitation(), false);
    const d = deps(store);

    await expect(
      acceptInvitation(d, { token: TOKEN, password: 'a-long-password' }),
    ).rejects.toThrow(InvitationNotUsableError);
    expect(d.sessions.sessions.size).toBe(0);
  });

  it('a new user needs a password', async () => {
    const { store } = createStore(pendingInvitation());

    await expect(acceptInvitation(deps(store), { token: TOKEN })).rejects.toThrow(
      PasswordRequiredError,
    );
  });

  it('the password meets the policy (NFR-ACC-01)', async () => {
    const { store, accepted } = createStore(pendingInvitation());

    await expect(
      acceptInvitation(deps(store), { token: TOKEN, password: 'corta' }),
    ).rejects.toThrow(WeakPasswordError);
    expect(accepted).toEqual([]);
  });
});
