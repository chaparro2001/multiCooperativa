import { describe, expect, it } from 'vitest';

import { ApiError, messageFor, NetworkError } from '../api/api-error';
import { initialCooperative } from '../cooperatives/selection';
import { canAccess, canManage, visibleModules } from '../navigation/modules';
import { MemoryKeyValueStore } from '../storage/key-value-store';
import { RELOCK_AFTER_MS, shouldLock } from './biometric-lock';
import { TokenStore, toStoredTokens } from './token-store';

describe('elegir cooperativa al entrar (HU-ACC-05)', () => {
  it('Dado una única membresía activa, cuando inicio sesión, entonces entro directamente en ella', () => {
    expect(initialCooperative(['a'], null)).toBe('a');
  });

  it('Dado varias membresías activas la primera vez, entonces veo el selector', () => {
    expect(initialCooperative(['a', 'b'], null)).toBeNull();
  });

  it('Dado que ya elegí cooperativa antes, cuando vuelvo a abrir la app, entonces entro en la última usada', () => {
    expect(initialCooperative(['a', 'b'], 'b')).toBe('b');
  });

  it('si la última usada ya no está activa, se vuelve a elegir', () => {
    expect(initialCooperative(['a', 'b'], 'c')).toBeNull();
    expect(initialCooperative(['a'], 'c')).toBe('a');
  });

  it('sin membresías activas no hay cooperativa', () => {
    expect(initialCooperative([], null)).toBeNull();
  });
});

describe('navegación según permisos (HU-ACC-06)', () => {
  const socio = [
    { module: 'comunicados', level: 'consulta', scope: 'todas' },
    { module: 'area-socio', level: 'consulta', scope: 'propias' },
  ] as const;

  it('solo incluye los módulos con consulta o gestión, en el orden de la app', () => {
    expect(visibleModules([...socio]).map((m) => m.module)).toEqual(['comunicados', 'area-socio']);
  });

  it('marca si se pueden mostrar las acciones de gestión', () => {
    const modules = visibleModules([{ module: 'facturas', level: 'gestion', scope: 'todas' }]);
    expect(modules).toEqual([
      { module: 'facturas', title: 'Facturas y albaranes', route: '/facturas', canManage: true },
    ]);
    expect(visibleModules([...socio])[0]?.canManage).toBe(false);
  });

  it('el módulo de usuarios se muestra como «Miembros»', () => {
    expect(
      visibleModules([{ module: 'usuarios', level: 'gestion', scope: 'todas' }])[0],
    ).toMatchObject({ title: 'Miembros', route: '/miembros' });
  });

  it('canAccess deniega si aún no hay permisos cargados', () => {
    expect(canAccess(undefined, 'comunicados')).toBe(false);
    expect(canAccess([...socio], 'comunicados')).toBe(true);
    expect(canAccess([...socio], 'facturas')).toBe(false);
  });

  it('canManage solo con nivel gestión: las pantallas de edición no existen sin él', () => {
    expect(canManage([...socio], 'comunicados')).toBe(false);
    expect(
      canManage([{ module: 'comunicados', level: 'gestion', scope: 'todas' }], 'comunicados'),
    ).toBe(true);
    expect(canManage(undefined, 'comunicados')).toBe(false);
  });
});

describe('bloqueo biométrico (HU-ACC-04)', () => {
  const base = { enabled: true, hasSession: true, backgroundedAt: null, now: 0, coldStart: false };

  it('Dado la biometría activada, cuando abro la app con sesión, entonces se pide antes de mostrar datos', () => {
    expect(shouldLock({ ...base, coldStart: true })).toBe(true);
  });

  it('no bloquea si está desactivada o no hay sesión', () => {
    expect(shouldLock({ ...base, coldStart: true, enabled: false })).toBe(false);
    expect(shouldLock({ ...base, coldStart: true, hasSession: false })).toBe(false);
  });

  it('al volver del segundo plano bloquea solo si pasó un rato', () => {
    expect(shouldLock({ ...base, backgroundedAt: 0, now: RELOCK_AFTER_MS - 1 })).toBe(false);
    expect(shouldLock({ ...base, backgroundedAt: 0, now: RELOCK_AFTER_MS })).toBe(true);
  });
});

describe('almacén de tokens (RNF-ACC-03)', () => {
  it('guarda y recupera la sesión con la caducidad calculada', async () => {
    const store = new TokenStore(new MemoryKeyValueStore());
    const stored = toStoredTokens(
      { accessToken: 'a', refreshToken: 'r', accessTokenExpiresIn: 900 },
      1000,
    );

    await store.save(stored);

    expect(await store.load()).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      accessTokenExpiresAt: 901_000,
    });
  });

  it('un contenido ilegible cuenta como sin sesión y se borra', async () => {
    const kv = new MemoryKeyValueStore();
    await kv.set('session', '{no-es-json');

    expect(await new TokenStore(kv).load()).toBeNull();
    expect(await kv.get('session')).toBeNull();
  });
});

describe('mensajes de error', () => {
  it('traduce los códigos conocidos y no revela si el email existe', () => {
    expect(messageFor(new ApiError(401, 'invalid_credentials', ''))).toBe(
      'Email o contraseña incorrectos.',
    );
  });

  it('usa el mensaje del servidor si el código no es conocido', () => {
    expect(messageFor(new ApiError(409, 'last_admin', 'Debe quedar un administrador.'))).toBe(
      'Debe quedar un administrador.',
    );
  });

  it('sin red y ante errores desconocidos da un texto genérico', () => {
    expect(messageFor(new NetworkError(null))).toBe('No se puede conectar con el servidor.');
    expect(messageFor(new Error('x'))).toBe('Ha ocurrido un error. Inténtalo de nuevo.');
  });
});
