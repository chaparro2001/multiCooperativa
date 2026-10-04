import { beforeEach, describe, expect, it } from 'vitest';

import { InvalidCredentialsError, LoginLockedError, NoActiveMembershipError } from './errors';
import { login } from './login';
import { FakeClock, fakeHasher, InMemoryLoginStore, sessionDeps } from './testing/fakes';

const PASSWORD = 'una-clave-larga';

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
    await expect(login(deps, { email: 'ada@campo.es', password: 'mala' })).rejects.toThrow(
      InvalidCredentialsError,
    );
    clock.advanceMinutes(1);
  }
}

describe('login (HU-ACC-02)', () => {
  it('Dado credenciales correctas y una membresía activa, cuando inicio sesión, entonces recibo una sesión', async () => {
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

  it('Dado una contraseña incorrecta, cuando inicio sesión, entonces recibo un error genérico', async () => {
    await expect(login(deps, { email: 'ada@campo.es', password: 'mala' })).rejects.toThrow(
      InvalidCredentialsError,
    );
    expect(deps.sessions.sessions.size).toBe(0);
  });

  it('Dado un email que no existe, cuando inicio sesión, entonces recibo el mismo error genérico (RNF-ACC-05)', async () => {
    await expect(login(deps, { email: 'nadie@campo.es', password: PASSWORD })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('un usuario invitado que aún no tiene contraseña no puede iniciar sesión', async () => {
    loginStore.addUser('nuevo@campo.es', {
      id: 'user-2',
      passwordHash: null,
      activeMemberships: 0,
    });

    await expect(login(deps, { email: 'nuevo@campo.es', password: '' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('Dado cinco intentos fallidos en quince minutos, cuando lo intento de nuevo, entonces queda bloqueado aunque la contraseña sea correcta', async () => {
    await failTimes(5);

    await expect(login(deps, { email: 'ada@campo.es', password: PASSWORD })).rejects.toThrow(
      LoginLockedError,
    );
  });

  it('el bloqueo dura 15 minutos desde el quinto fallo (RN-ACC-11)', async () => {
    await failTimes(5);
    clock.advanceMinutes(14); // 15 minutos después del quinto fallo

    await expect(login(deps, { email: 'ada@campo.es', password: PASSWORD })).resolves.toBeDefined();
  });

  it('un email que no existe también se bloquea, para no revelar si existe', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(login(deps, { email: 'nadie@campo.es', password: 'x' })).rejects.toThrow(
        InvalidCredentialsError,
      );
    }

    await expect(login(deps, { email: 'nadie@campo.es', password: 'x' })).rejects.toThrow(
      LoginLockedError,
    );
  });

  it('un inicio de sesión correcto pone a cero los intentos fallidos', async () => {
    await failTimes(4);
    await login(deps, { email: 'ada@campo.es', password: PASSWORD });
    await failTimes(1);

    await expect(login(deps, { email: 'ada@campo.es', password: PASSWORD })).resolves.toBeDefined();
  });

  it('Dado credenciales correctas sin membresía activa, cuando inicio sesión, entonces veo que no tengo acceso a ninguna cooperativa', async () => {
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
