import type { AccessLevel, Module, Scope } from '../domain/permission';
import type { PredefinedProfileName } from '../domain/predefined-profiles';

/** Test data shared by the domain and the HTTP tests of the access matrix. */

export type Cell = 'no access' | AccessLevel | `${AccessLevel}·${Scope}`;

// Matrix of section 3 of the specification, copied as is.
export const SPEC_MATRIX: Record<Module, Record<PredefinedProfileName, Cell>> = {
  announcements: {
    Socio: 'read',
    'Consejo rector': 'manage',
    Gestor: 'read',
    Administrador: 'manage',
  },
  assemblies: {
    Socio: 'read',
    'Consejo rector': 'manage',
    Gestor: 'no access',
    Administrador: 'manage',
  },
  documents: {
    Socio: 'read',
    'Consejo rector': 'manage',
    Gestor: 'read',
    Administrador: 'manage',
  },
  invoicing: {
    Socio: 'no access',
    'Consejo rector': 'read',
    Gestor: 'manage',
    Administrador: 'manage',
  },
  'member-area': {
    Socio: 'read·own',
    'Consejo rector': 'read·all',
    Gestor: 'manage·all',
    Administrador: 'manage·all',
  },
  assistant: {
    Socio: 'read',
    'Consejo rector': 'read',
    Gestor: 'read',
    Administrador: 'read',
  },
  users: {
    Socio: 'no access',
    'Consejo rector': 'no access',
    Gestor: 'no access',
    Administrador: 'manage',
  },
};

/** Splits a cell into what it grants: null for no access. */
export function parseCell(cell: Cell): { level: AccessLevel; scope: Scope } | null {
  if (cell === 'no access') return null;
  const [level, scope = 'all'] = cell.split('·') as [AccessLevel, Scope?];
  return { level, scope };
}
