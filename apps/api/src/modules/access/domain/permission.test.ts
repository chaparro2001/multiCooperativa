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
  createPermission('comunicados', 'consulta'),
  createPermission('facturas', 'gestion'),
  createPermission('area-socio', 'consulta', 'propias'),
];

describe('resolveAccess (RN-ACC-04)', () => {
  it('concede consulta cuando el perfil tiene consulta', () => {
    expect(resolveAccess(permissions, 'comunicados', 'consulta')).toEqual({
      granted: true,
      scope: 'todas',
    });
  });

  it('deniega gestión cuando el perfil solo tiene consulta', () => {
    expect(resolveAccess(permissions, 'comunicados', 'gestion')).toEqual({ granted: false });
  });

  it('gestión incluye consulta', () => {
    expect(resolveAccess(permissions, 'facturas', 'consulta')).toEqual({
      granted: true,
      scope: 'todas',
    });
  });

  it('la ausencia de permiso equivale a sin acceso', () => {
    expect(resolveAccess(permissions, 'asambleas', 'consulta')).toEqual({ granted: false });
  });

  it('sin permisos se deniega todo', () => {
    expect(resolveAccess([], 'comunicados', 'consulta')).toEqual({ granted: false });
  });

  it('devuelve el alcance del permiso concedido', () => {
    expect(resolveAccess(permissions, 'area-socio', 'consulta')).toEqual({
      granted: true,
      scope: 'propias',
    });
  });
});

describe('createPermission (RN-ACC-05)', () => {
  it('el alcance por defecto es todas', () => {
    expect(createPermission('documentos', 'consulta')).toEqual({
      module: 'documentos',
      level: 'consulta',
      scope: 'todas',
    });
  });

  it('admite el alcance propias en el área del socio', () => {
    expect(createPermission('area-socio', 'consulta', 'propias').scope).toBe('propias');
  });

  it.each(['comunicados', 'asambleas', 'documentos', 'facturas', 'asistente', 'usuarios'] as const)(
    'rechaza el alcance propias en %s',
    (module) => {
      expect(() => createPermission(module, 'consulta', 'propias')).toThrow(InvalidPermissionError);
    },
  );
});

describe('requireAccess (HU-ACC-07)', () => {
  it('devuelve el alcance cuando el permiso lo concede', () => {
    expect(requireAccess(permissions, 'area-socio', 'consulta')).toBe('propias');
  });

  it('Dado un miembro sin acceso a un módulo, cuando lo pide, entonces se deniega', () => {
    expect(() => requireAccess(permissions, 'asambleas', 'consulta')).toThrow(
      ModuleAccessDeniedError,
    );
  });

  it('deniega gestión con solo consulta', () => {
    expect(() => requireAccess(permissions, 'comunicados', 'gestion')).toThrow(
      ModuleAccessDeniedError,
    );
  });

  it('sin permisos deniega todo', () => {
    expect(() => requireAccess([], 'comunicados', 'consulta')).toThrow(ModuleAccessDeniedError);
  });
});

describe('hasAccess', () => {
  it('dice si el nivel está concedido sin lanzar', () => {
    expect(hasAccess(permissions, 'facturas', 'gestion')).toBe(true);
    expect(hasAccess(permissions, 'comunicados', 'gestion')).toBe(false);
    expect(hasAccess(permissions, 'asambleas', 'consulta')).toBe(false);
  });
});
