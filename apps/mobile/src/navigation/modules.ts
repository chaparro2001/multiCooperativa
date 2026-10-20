import type { Module, MyPermissionsResponse } from '@multicooperativa/contracts';

export interface ModuleEntry {
  module: Module;
  /** Shown in the home grid; decorative, screen readers read the title (`enums.module.<module>`). */
  emoji: string;
  /** Screen of the module inside the cooperative. */
  route: `/${string}`;
}

/** Order of the home grid. */
export const MODULE_ENTRIES: readonly ModuleEntry[] = [
  { module: 'announcements', emoji: '📢', route: '/announcements' },
  { module: 'assemblies', emoji: '🗳️', route: '/assemblies' },
  { module: 'documents', emoji: '📄', route: '/documents' },
  { module: 'invoicing', emoji: '🧾', route: '/invoices' },
  { module: 'member-area', emoji: '👤', route: '/member-area' },
  { module: 'assistant', emoji: '🤖', route: '/assistant' },
  { module: 'users', emoji: '👥', route: '/members' },
];

export interface VisibleModule extends ModuleEntry {
  /** "Manage" level: the screen shows create, edit and delete actions (US-ACC-06). */
  canManage: boolean;
}

/**
 * US-ACC-06: only the modules the profile can at least read. The server is
 * still the authority; this only hides what would answer 403.
 */
export function visibleModules(permissions: MyPermissionsResponse['permissions']): VisibleModule[] {
  return MODULE_ENTRIES.flatMap((entry) => {
    const permission = permissions.find((candidate) => candidate.module === entry.module);
    return permission ? [{ ...entry, canManage: permission.level === 'manage' }] : [];
  });
}

export function canAccess(
  permissions: MyPermissionsResponse['permissions'] | undefined,
  module: Module,
): boolean {
  return permissions?.some((permission) => permission.module === module) ?? false;
}

/** "Manage" level on the module: create, edit and delete screens exist only then. */
export function canManage(
  permissions: MyPermissionsResponse['permissions'] | undefined,
  module: Module,
): boolean {
  return permissions?.some((p) => p.module === module && p.level === 'manage') ?? false;
}
