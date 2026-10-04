import { describe, expect, it } from 'vitest';

import { parseCell, SPEC_MATRIX } from '../testing/spec-permission-matrix';
import { MODULES, resolveAccess } from './permission';
import { isAdminProfile, PREDEFINED_PROFILES } from './predefined-profiles';

const cases = MODULES.flatMap((module) =>
  PREDEFINED_PROFILES.map((profile) => ({
    module,
    profile: profile.name,
    cell: SPEC_MATRIX[module][profile.name],
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
    const grant = parseCell(cell);
    const read = resolveAccess(permissions, module, 'consulta');
    const manage = resolveAccess(permissions, module, 'gestion');

    if (!grant) {
      expect(read).toEqual({ granted: false });
      expect(manage).toEqual({ granted: false });
    } else {
      expect(read).toEqual({ granted: true, scope: grant.scope });
      expect(manage.granted).toBe(grant.level === 'gestion');
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
