import { beforeEach, describe, expect, it } from 'vitest';

import { InvalidRefreshTokenError } from './errors';
import { logout } from './logout';
import { refreshSession } from './refresh-session';
import { startSession } from './session-tokens';
import { FakeClock, sessionDeps } from './testing/fakes';

let clock: FakeClock;
let deps: ReturnType<typeof sessionDeps>;
let refreshToken: string;

beforeEach(async () => {
  clock = new FakeClock(new Date('2026-10-10T10:00:00Z'));
  deps = sessionDeps(clock);
  ({ refreshToken } = await startSession(deps, 'user-1', clock.now()));
});

const onlySession = () => [...deps.sessions.sessions.values()][0]!;

describe('session renewal (US-ACC-03)', () => {
  it('Given a current refresh token, when it is renewed, then new tokens are issued and the refresh token rotates', async () => {
    clock.advanceMinutes(20);

    const tokens = await refreshSession(deps, refreshToken);

    expect(tokens.refreshToken).not.toBe(refreshToken);
    expect(tokens.accessToken).toBe(`jwt(user-1,${onlySession().id})`);
    expect(onlySession().refreshTokenHash).toBe('sha(secret-2)');
  });

  it('each renewal extends the session by another 30 days (NFR-ACC-02)', async () => {
    clock.advanceMinutes(60);

    await refreshSession(deps, refreshToken);

    expect(onlySession().expiresAt).toEqual(new Date('2026-11-09T11:00:00Z'));
  });

  it('Given an already used refresh token, when someone uses it again, then the whole session is revoked', async () => {
    const renewed = await refreshSession(deps, refreshToken);

    await expect(refreshSession(deps, refreshToken)).rejects.toThrow(InvalidRefreshTokenError);
    expect(onlySession().revokedAt).toEqual(clock.now());
    // The most recent legitimate token stops being valid too.
    await expect(refreshSession(deps, renewed.refreshToken)).rejects.toThrow(
      InvalidRefreshTokenError,
    );
  });

  it('rejects an expired session', async () => {
    clock.advanceMinutes(30 * 24 * 60);

    await expect(refreshSession(deps, refreshToken)).rejects.toThrow(InvalidRefreshTokenError);
  });

  it.each(['', 'garbage', 'not-a-uuid.secret', '00000000-0000-4000-8000-000000000099.secret'])(
    'rejects a malformed or unknown token: %j',
    async (token) => {
      await expect(refreshSession(deps, token)).rejects.toThrow(InvalidRefreshTokenError);
    },
  );
});

describe('logout (US-ACC-03)', () => {
  it('Given a logged-in session, when I log out, then it is revoked on the server', async () => {
    await logout(deps, refreshToken);

    expect(onlySession().revokedAt).toEqual(clock.now());
    await expect(refreshSession(deps, refreshToken)).rejects.toThrow(InvalidRefreshTokenError);
  });

  it('is idempotent and does not fail with an unknown token', async () => {
    await logout(deps, refreshToken);
    await expect(logout(deps, refreshToken)).resolves.toBeUndefined();
    await expect(logout(deps, 'garbage')).resolves.toBeUndefined();
  });

  it('an old token does not close the session of whoever holds it now', async () => {
    await refreshSession(deps, refreshToken);

    await logout(deps, refreshToken);

    expect(onlySession().revokedAt).toBeNull();
  });
});
