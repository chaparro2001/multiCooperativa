import { beforeEach, describe, expect, it } from 'vitest';

import { InvalidCredentialsError, LoginLockedError, NoActiveMembershipError } from './errors';
import { login } from './login';
import { FakeClock, fakeHasher, InMemoryLoginStore, sessionDeps } from './testing/fakes';

const PASSWORD = 'a-long-password';

let clock: FakeClock;
let loginStore: InMemoryLoginStore;
let deps: ReturnType<typeof sessionDeps> & {
  loginStore: InMemoryLoginStore;
  hasher: typeof fakeHasher;
};

beforeEach(() => {
  clock = new FakeClock(new Date('2026-10-10T10:00:00Z'));
  loginStore = new InMemoryLoginStore();
  loginStore.addUser('ada@campo.es', {
    id: 'user-1',
    passwordHash: `hashed(${PASSWORD})`,
    activeMemberships: 1,
  });
  deps = { ...sessionDeps(clock), loginStore, hasher: fakeHasher };
});

async function failTimes(times: number) {
  for (let i = 0; i < times; i++) {
    await expect(login(deps, { email: 'ada@campo.es', password: 'wrong' })).rejects.toThrow(
      InvalidCredentialsError,
    );
    clock.advanceMinutes(1);
  }
}

describe('login (US-ACC-02)', () => {
  it('Given correct credentials and an active membership, when I log in, then I get a session', async () => {
    const tokens = await login(deps, { email: ' Ada@Campo.ES ', password: PASSWORD });

    const [session] = [...deps.sessions.sessions.values()];
    expect(session).toMatchObject({ userId: 'user-1', revokedAt: null });
    expect(tokens).toEqual({
      accessToken: `jwt(user-1,${session!.id})`,
      accessTokenExpiresIn: 900,
      refreshToken: `${session!.id}.secret-1`,
    });
    expect(session!.refreshTokenHash).toBe('sha(secret-1)');
  });

  it('Given a wrong password, when I log in, then I get a generic error', async () => {
    await expect(login(deps, { email: 'ada@campo.es', password: 'wrong' })).rejects.toThrow(
      InvalidCredentialsError,
    );
    expect(deps.sessions.sessions.size).toBe(0);
  });

  it('Given an email that does not exist, when I log in, then I get the same generic error (NFR-ACC-05)', async () => {
    await expect(login(deps, { email: 'nobody@campo.es', password: PASSWORD })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('an invited user who has no password yet cannot log in', async () => {
    loginStore.addUser('new@campo.es', {
      id: 'user-2',
      passwordHash: null,
      activeMemberships: 0,
    });

    await expect(login(deps, { email: 'new@campo.es', password: '' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('Given five failed attempts in fifteen minutes, when I try again, then I am locked out even if the password is correct', async () => {
    await failTimes(5);

    await expect(login(deps, { email: 'ada@campo.es', password: PASSWORD })).rejects.toThrow(
      LoginLockedError,
    );
  });

  it('the lockout lasts 15 minutes from the fifth failure (BR-ACC-11)', async () => {
    await failTimes(5);
    clock.advanceMinutes(14); // 15 minutes after the fifth failure

    await expect(login(deps, { email: 'ada@campo.es', password: PASSWORD })).resolves.toBeDefined();
  });

  it('an email that does not exist is also locked, so as not to reveal whether it exists', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(login(deps, { email: 'nobody@campo.es', password: 'x' })).rejects.toThrow(
        InvalidCredentialsError,
      );
    }

    await expect(login(deps, { email: 'nobody@campo.es', password: 'x' })).rejects.toThrow(
      LoginLockedError,
    );
  });

  it('a successful login resets the failed attempts', async () => {
    await failTimes(4);
    await login(deps, { email: 'ada@campo.es', password: PASSWORD });
    await failTimes(1);

    await expect(login(deps, { email: 'ada@campo.es', password: PASSWORD })).resolves.toBeDefined();
  });

  it('Given correct credentials without an active membership, when I log in, then I see I have no access to any cooperative', async () => {
    loginStore.addUser('ex@campo.es', {
      id: 'user-3',
      passwordHash: `hashed(${PASSWORD})`,
      activeMemberships: 0,
    });

    await expect(login(deps, { email: 'ex@campo.es', password: PASSWORD })).rejects.toThrow(
      NoActiveMembershipError,
    );
    expect(deps.sessions.sessions.size).toBe(0);
  });
});
