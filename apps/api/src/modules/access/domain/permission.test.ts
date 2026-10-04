import { describe, expect, it } from 'vitest';

import { InvalidPermissionError } from './errors';
import { createPermission, type Permission, resolveAccess } from './permission';

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
