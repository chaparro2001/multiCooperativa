import { createPermission, type Permission, resolveAccess } from './permission';

export type PredefinedProfileName = 'Socio' | 'Consejo rector' | 'Gestor' | 'Administrador';

export interface PredefinedProfile {
  readonly name: PredefinedProfileName;
  readonly permissions: readonly Permission[];
}

/** Profiles every cooperative is born with (section 3 of the access specification). */
export const PREDEFINED_PROFILES: readonly PredefinedProfile[] = [
  {
    name: 'Socio',
    permissions: [
      createPermission('comunicados', 'consulta'),
      createPermission('asambleas', 'consulta'),
      createPermission('documentos', 'consulta'),
      createPermission('area-socio', 'consulta', 'propias'),
      createPermission('asistente', 'consulta'),
    ],
  },
  {
    name: 'Consejo rector',
    permissions: [
      createPermission('comunicados', 'gestion'),
      createPermission('asambleas', 'gestion'),
      createPermission('documentos', 'gestion'),
      createPermission('facturas', 'consulta'),
      createPermission('area-socio', 'consulta'),
      createPermission('asistente', 'consulta'),
    ],
  },
  {
    name: 'Gestor',
    permissions: [
      createPermission('comunicados', 'consulta'),
      createPermission('documentos', 'consulta'),
      createPermission('facturas', 'gestion'),
      createPermission('area-socio', 'gestion'),
      createPermission('asistente', 'consulta'),
    ],
  },
  {
    name: 'Administrador',
    permissions: [
      createPermission('comunicados', 'gestion'),
      createPermission('asambleas', 'gestion'),
      createPermission('documentos', 'gestion'),
      createPermission('facturas', 'gestion'),
      createPermission('area-socio', 'gestion'),
      createPermission('asistente', 'consulta'),
      createPermission('usuarios', 'gestion'),
    ],
  },
];

/** An administrator is whoever manages the "Usuarios y perfiles" module (section 2). */
export function isAdminProfile(permissions: readonly Permission[]): boolean {
  return resolveAccess(permissions, 'usuarios', 'gestion').granted;
}
