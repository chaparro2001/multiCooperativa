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

describe('renovación de la sesión (HU-ACC-03)', () => {
  it('Dado un token de refresco vigente, cuando se renueva, entonces se emiten tokens nuevos y el refresco rota', async () => {
    clock.advanceMinutes(20);

    const tokens = await refreshSession(deps, refreshToken);

    expect(tokens.refreshToken).not.toBe(refreshToken);
    expect(tokens.accessToken).toBe(`jwt(user-1,${onlySession().id})`);
    expect(onlySession().refreshTokenHash).toBe('sha(secret-2)');
  });

  it('cada renovación amplía la sesión 30 días más (RNF-ACC-02)', async () => {
    clock.advanceMinutes(60);

    await refreshSession(deps, refreshToken);

    expect(onlySession().expiresAt).toEqual(new Date('2026-11-09T11:00:00Z'));
  });

  it('Dado un token de refresco ya utilizado, cuando alguien lo usa de nuevo, entonces se revoca toda la sesión', async () => {
    const renewed = await refreshSession(deps, refreshToken);

    await expect(refreshSession(deps, refreshToken)).rejects.toThrow(InvalidRefreshTokenError);
    expect(onlySession().revokedAt).toEqual(clock.now());
    // El token legítimo más reciente también deja de valer.
    await expect(refreshSession(deps, renewed.refreshToken)).rejects.toThrow(
      InvalidRefreshTokenError,
    );
  });

  it('rechaza una sesión caducada', async () => {
    clock.advanceMinutes(30 * 24 * 60);

    await expect(refreshSession(deps, refreshToken)).rejects.toThrow(InvalidRefreshTokenError);
  });

  it.each(['', 'basura', 'no-es-uuid.secreto', '00000000-0000-4000-8000-000000000099.secreto'])(
    'rechaza un token mal formado o desconocido: %j',
    async (token) => {
      await expect(refreshSession(deps, token)).rejects.toThrow(InvalidRefreshTokenError);
    },
  );
});

describe('cierre de sesión (HU-ACC-03)', () => {
  it('Dado una sesión iniciada, cuando cierro sesión, entonces se revoca en el servidor', async () => {
    await logout(deps, refreshToken);

    expect(onlySession().revokedAt).toEqual(clock.now());
    await expect(refreshSession(deps, refreshToken)).rejects.toThrow(InvalidRefreshTokenError);
  });

  it('es idempotente y no falla con un token desconocido', async () => {
    await logout(deps, refreshToken);
    await expect(logout(deps, refreshToken)).resolves.toBeUndefined();
    await expect(logout(deps, 'basura')).resolves.toBeUndefined();
  });

  it('un token antiguo no cierra la sesión de quien la tiene ahora', async () => {
    await refreshSession(deps, refreshToken);

    await logout(deps, refreshToken);

    expect(onlySession().revokedAt).toBeNull();
  });
});
