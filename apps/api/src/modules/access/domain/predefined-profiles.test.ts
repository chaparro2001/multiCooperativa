import { describe, expect, it } from 'vitest';

import { type AccessLevel, MODULES, type Module, resolveAccess, type Scope } from './permission';
import {
  isAdminProfile,
  PREDEFINED_PROFILES,
  type PredefinedProfileName,
} from './predefined-profiles';

type Cell = 'sin acceso' | AccessLevel | `${AccessLevel}·${Scope}`;

// Matriz del apartado 3 de la especificación, copiada tal cual.
const MATRIX: Record<Module, Record<PredefinedProfileName, Cell>> = {
  comunicados: {
    Socio: 'consulta',
    'Consejo rector': 'gestion',
    Gestor: 'consulta',
    Administrador: 'gestion',
  },
  asambleas: {
    Socio: 'consulta',
    'Consejo rector': 'gestion',
    Gestor: 'sin acceso',
    Administrador: 'gestion',
  },
  documentos: {
    Socio: 'consulta',
    'Consejo rector': 'gestion',
    Gestor: 'consulta',
    Administrador: 'gestion',
  },
  facturas: {
    Socio: 'sin acceso',
    'Consejo rector': 'consulta',
    Gestor: 'gestion',
    Administrador: 'gestion',
  },
  'area-socio': {
    Socio: 'consulta·propias',
    'Consejo rector': 'consulta·todas',
    Gestor: 'gestion·todas',
    Administrador: 'gestion·todas',
  },
  asistente: {
    Socio: 'consulta',
    'Consejo rector': 'consulta',
    Gestor: 'consulta',
    Administrador: 'consulta',
  },
  usuarios: {
    Socio: 'sin acceso',
    'Consejo rector': 'sin acceso',
    Gestor: 'sin acceso',
    Administrador: 'gestion',
  },
};

const cases = MODULES.flatMap((module) =>
  PREDEFINED_PROFILES.map((profile) => ({
    module,
    profile: profile.name,
    cell: MATRIX[module][profile.name],
  })),
);

describe('perfiles predefinidos (matriz del apartado 3)', () => {
  it('son exactamente los cuatro de la especificación', () => {
    expect(PREDEFINED_PROFILES.map((profile) => profile.name)).toEqual([
      'Socio',
      'Consejo rector',
      'Gestor',
      'Administrador',
    ]);
  });

  it.each(cases)('$profile en $module: $cell', ({ module, profile, cell }) => {
    const { permissions } = PREDEFINED_PROFILES.find((candidate) => candidate.name === profile)!;
    const [level, scope = 'todas'] = cell.split('·') as [Cell, Scope?];
    const read = resolveAccess(permissions, module, 'consulta');
    const manage = resolveAccess(permissions, module, 'gestion');

    if (level === 'sin acceso') {
      expect(read).toEqual({ granted: false });
      expect(manage).toEqual({ granted: false });
    } else {
      expect(read).toEqual({ granted: true, scope });
      expect(manage.granted).toBe(level === 'gestion');
    }
  });

  it('solo el Administrador es perfil administrador (gestión de usuarios y perfiles)', () => {
    expect(
      PREDEFINED_PROFILES.filter((profile) => isAdminProfile(profile.permissions)).map(
        (profile) => profile.name,
      ),
    ).toEqual(['Administrador']);
  });
});
