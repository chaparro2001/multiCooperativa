import { describe, expect, it } from 'vitest';

import { InvalidPermissionError, ModuleAccessDeniedError } from './errors';
import {
  createPermission,
  hasAccess,
  type Permission,
  requireAccess,
  resolveAccess,
} from './permission';

const permissions: Permission[] = [
  createPermission('announcements', 'read'),
  createPermission('invoicing', 'manage'),
  createPermission('member-area', 'read', 'own'),
];

describe('resolveAccess (BR-ACC-04)', () => {
  it('grants read when the profile has read', () => {
    expect(resolveAccess(permissions, 'announcements', 'read')).toEqual({
      granted: true,
      scope: 'all',
    });
  });

  it('denies manage when the profile only has read', () => {
    expect(resolveAccess(permissions, 'announcements', 'manage')).toEqual({ granted: false });
  });

  it('manage includes read', () => {
    expect(resolveAccess(permissions, 'invoicing', 'read')).toEqual({
      granted: true,
      scope: 'all',
    });
  });

  it('the absence of a permission equals no access', () => {
    expect(resolveAccess(permissions, 'assemblies', 'read')).toEqual({ granted: false });
  });

  it('without permissions everything is denied', () => {
    expect(resolveAccess([], 'announcements', 'read')).toEqual({ granted: false });
  });

  it('returns the scope of the granted permission', () => {
    expect(resolveAccess(permissions, 'member-area', 'read')).toEqual({
      granted: true,
      scope: 'own',
    });
  });
});

describe('createPermission (BR-ACC-05)', () => {
  it('the default scope is all', () => {
    expect(createPermission('documents', 'read')).toEqual({
      module: 'documents',
      level: 'read',
      scope: 'all',
    });
  });

  it('accepts the own scope in the member area', () => {
    expect(createPermission('member-area', 'read', 'own').scope).toBe('own');
  });

  it.each(['announcements', 'assemblies', 'documents', 'invoicing', 'assistant', 'users'] as const)(
    'rejects the own scope in %s',
    (module) => {
      expect(() => createPermission(module, 'read', 'own')).toThrow(InvalidPermissionError);
    },
  );
});

describe('requireAccess (US-ACC-07)', () => {
  it('returns the scope when the permission grants it', () => {
    expect(requireAccess(permissions, 'member-area', 'read')).toBe('own');
  });

  it('Given a member without access to a module, when they request it, then it is denied', () => {
    expect(() => requireAccess(permissions, 'assemblies', 'read')).toThrow(ModuleAccessDeniedError);
  });

  it('denies manage with only read', () => {
    expect(() => requireAccess(permissions, 'announcements', 'manage')).toThrow(
      ModuleAccessDeniedError,
    );
  });

  it('without permissions it denies everything', () => {
    expect(() => requireAccess([], 'announcements', 'read')).toThrow(ModuleAccessDeniedError);
  });
});

describe('hasAccess', () => {
  it('tells whether the level is granted without throwing', () => {
    expect(hasAccess(permissions, 'invoicing', 'manage')).toBe(true);
    expect(hasAccess(permissions, 'announcements', 'manage')).toBe(false);
    expect(hasAccess(permissions, 'assemblies', 'read')).toBe(false);
  });
});
