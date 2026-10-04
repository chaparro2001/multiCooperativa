import type { AccessLevel, Module, Scope } from '../domain/permission';
import type { PredefinedProfileName } from '../domain/predefined-profiles';

/** Test data shared by the domain and the HTTP tests of the access matrix. */

export type Cell = 'sin acceso' | AccessLevel | `${AccessLevel}·${Scope}`;

// Matriz del apartado 3 de la especificación, copiada tal cual.
export const SPEC_MATRIX: Record<Module, Record<PredefinedProfileName, Cell>> = {
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

/** Splits a cell into what it grants: null for no access. */
export function parseCell(cell: Cell): { level: AccessLevel; scope: Scope } | null {
  if (cell === 'sin acceso') return null;
  const [level, scope = 'todas'] = cell.split('·') as [AccessLevel, Scope?];
  return { level, scope };
}
