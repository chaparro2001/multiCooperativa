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
      createPermission('announcements', 'read'),
      createPermission('assemblies', 'read'),
      createPermission('documents', 'read'),
      createPermission('member-area', 'read', 'own'),
      createPermission('assistant', 'read'),
    ],
  },
  {
    name: 'Consejo rector',
    permissions: [
      createPermission('announcements', 'manage'),
      createPermission('assemblies', 'manage'),
      createPermission('documents', 'manage'),
      createPermission('invoicing', 'read'),
      createPermission('member-area', 'read'),
      createPermission('assistant', 'read'),
    ],
  },
  {
    name: 'Gestor',
    permissions: [
      createPermission('announcements', 'read'),
      createPermission('documents', 'read'),
      createPermission('invoicing', 'manage'),
      createPermission('member-area', 'manage'),
      createPermission('assistant', 'read'),
    ],
  },
  {
    name: 'Administrador',
    permissions: [
      createPermission('announcements', 'manage'),
      createPermission('assemblies', 'manage'),
      createPermission('documents', 'manage'),
      createPermission('invoicing', 'manage'),
      createPermission('member-area', 'manage'),
      createPermission('assistant', 'read'),
      createPermission('users', 'manage'),
    ],
  },
];

/** An administrator is whoever manages the "Users and profiles" module (section 2). */
export function isAdminProfile(permissions: readonly Permission[]): boolean {
  return resolveAccess(permissions, 'users', 'manage').granted;
}
