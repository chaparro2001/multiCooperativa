import { describe, expect, it } from 'vitest';

import { i18n } from '../i18n';
import { ApiError, messageFor, NetworkError } from '../api/api-error';
import { initialCooperative } from '../cooperatives/selection';
import { canAccess, canManage, MODULE_ENTRIES, visibleModules } from '../navigation/modules';
import { MemoryKeyValueStore } from '../storage/key-value-store';
import { RELOCK_AFTER_MS, shouldLock } from './biometric-lock';
import { TokenStore, toStoredTokens } from './token-store';

describe('choosing a cooperative on entry (US-ACC-05)', () => {
  it('Given a single active membership, when I log in, then I enter it directly', () => {
    expect(initialCooperative(['a'], null)).toBe('a');
  });

  it('Given several active memberships the first time, then I see the selector', () => {
    expect(initialCooperative(['a', 'b'], null)).toBeNull();
  });

  it('Given I already chose a cooperative before, when I reopen the app, then I enter the last used one', () => {
    expect(initialCooperative(['a', 'b'], 'b')).toBe('b');
  });

  it('if the last used one is no longer active, the user chooses again', () => {
    expect(initialCooperative(['a', 'b'], 'c')).toBeNull();
    expect(initialCooperative(['a'], 'c')).toBe('a');
  });

  it('without active memberships there is no cooperative', () => {
    expect(initialCooperative([], null)).toBeNull();
  });
});

describe('navigation by permissions (US-ACC-06)', () => {
  const partner = [
    { module: 'announcements', level: 'read', scope: 'all' },
    { module: 'member-area', level: 'read', scope: 'own' },
  ] as const;

  it('includes only the modules with read or manage access, in the app order', () => {
    expect(visibleModules([...partner]).map((m) => m.module)).toEqual([
      'announcements',
      'member-area',
    ]);
  });

  it('flags whether the management actions can be shown', () => {
    const modules = visibleModules([{ module: 'invoicing', level: 'manage', scope: 'all' }]);
    expect(modules).toEqual([
      { id: 'invoicing', module: 'invoicing', emoji: '🧾', route: '/invoices', canManage: true },
      {
        id: 'third-parties',
        module: 'invoicing',
        titleKey: 'invoicing.thirdParties.title',
        emoji: '🤝',
        route: '/invoices/third-parties',
        canManage: true,
      },
    ]);
    expect(visibleModules([...partner])[0]?.canManage).toBe(false);
  });

  it('the users module opens the members screen', () => {
    expect(visibleModules([{ module: 'users', level: 'manage', scope: 'all' }])[0]).toMatchObject({
      route: '/members',
    });
  });

  it('every module has a localized title', () => {
    for (const entry of MODULE_ENTRIES) {
      const key = entry.titleKey ?? `enums.module.${entry.module}`;
      expect(i18n.t(key)).not.toBe(key);
    }
  });

  it('suppliers and customers have their own tile with the invoicing permission (BR-INV-01)', () => {
    const ids = (level: 'read' | 'manage') =>
      visibleModules([{ module: 'invoicing', level, scope: 'all' }]).map((m) => m.id);
    expect(ids('read')).toEqual(['invoicing', 'third-parties']);
    expect(visibleModules([...partner]).some((m) => m.id === 'third-parties')).toBe(false);
  });

  it('canAccess denies while the permissions are not loaded yet', () => {
    expect(canAccess(undefined, 'announcements')).toBe(false);
    expect(canAccess([...partner], 'announcements')).toBe(true);
    expect(canAccess([...partner], 'invoicing')).toBe(false);
  });

  it('canManage only with the manage level: the editing screens do not exist without it', () => {
    expect(canManage([...partner], 'announcements')).toBe(false);
    expect(
      canManage([{ module: 'announcements', level: 'manage', scope: 'all' }], 'announcements'),
    ).toBe(true);
    expect(canManage(undefined, 'announcements')).toBe(false);
  });
});

describe('biometric lock (US-ACC-04)', () => {
  const base = { enabled: true, hasSession: true, backgroundedAt: null, now: 0, coldStart: false };

  it('Given biometrics enabled, when I open the app with a session, then it asks before showing data', () => {
    expect(shouldLock({ ...base, coldStart: true })).toBe(true);
  });

  it('does not lock if it is disabled or there is no session', () => {
    expect(shouldLock({ ...base, coldStart: true, enabled: false })).toBe(false);
    expect(shouldLock({ ...base, coldStart: true, hasSession: false })).toBe(false);
  });

  it('when coming back from the background it locks only after a while', () => {
    expect(shouldLock({ ...base, backgroundedAt: 0, now: RELOCK_AFTER_MS - 1 })).toBe(false);
    expect(shouldLock({ ...base, backgroundedAt: 0, now: RELOCK_AFTER_MS })).toBe(true);
  });
});

describe('token store (NFR-ACC-03)', () => {
  it('saves and loads the session with the computed expiry', async () => {
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

  it('unreadable content counts as no session and is deleted', async () => {
    const kv = new MemoryKeyValueStore();
    await kv.set('session', '{not-json');

    expect(await new TokenStore(kv).load()).toBeNull();
    expect(await kv.get('session')).toBeNull();
  });
});

describe('error messages', () => {
  it('maps known codes to localized text and does not reveal whether the email exists', () => {
    expect(
      messageFor(new ApiError(401, 'invalid_credentials', 'Incorrect email or password.')),
    ).toBe('Email o contraseña incorrectos.');
  });

  it('never shows the developer message of the API: unknown codes get the generic text', () => {
    expect(messageFor(new ApiError(409, 'some_new_code', 'Developer message.'))).toBe(
      'Ha ocurrido un error. Inténtalo de nuevo.',
    );
  });

  it('builds the text from the details the API sends with the code', () => {
    expect(
      messageFor(
        new ApiError(400, 'invalid_announcement', '', {
          issues: ['title_missing', 'body_missing'],
        }),
      ),
    ).toBe('No se puede guardar el comunicado: falta el título y falta el cuerpo.');
    expect(messageFor(new ApiError(400, 'file_rejected', '', { reason: 'too_large' }))).toBe(
      'El documento puede ocupar como máximo 20 MB.',
    );
    expect(messageFor(new ApiError(400, 'insufficient_notice', '', { minNoticeDays: 15 }))).toBe(
      'La asamblea debe convocarse con al menos 15 días de antelación.',
    );
  });

  it('without a network and for unknown errors it gives a generic text', () => {
    expect(messageFor(new NetworkError(null))).toBe('No se puede conectar con el servidor.');
    expect(messageFor(new Error('x'))).toBe('Ha ocurrido un error. Inténtalo de nuevo.');
  });
});
