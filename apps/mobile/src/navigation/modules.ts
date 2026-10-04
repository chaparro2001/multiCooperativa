import type { Module, MyPermissionsResponse } from '@multicooperativa/contracts';

export interface ModuleEntry {
  module: Module;
  title: string;
  /** Shown in the home grid; decorative, screen readers read the title. */
  emoji: string;
  /** Screen of the module inside the cooperative. */
  route: `/${string}`;
}

/** Order of the home grid. */
export const MODULE_ENTRIES: readonly ModuleEntry[] = [
  { module: 'comunicados', title: 'Comunicados', emoji: '📢', route: '/comunicados' },
  { module: 'asambleas', title: 'Asambleas', emoji: '🗳️', route: '/asambleas' },
  { module: 'documentos', title: 'Documentos', emoji: '📄', route: '/documentos' },
  { module: 'facturas', title: 'Facturas y albaranes', emoji: '🧾', route: '/facturas' },
  { module: 'area-socio', title: 'Área del socio', emoji: '👤', route: '/area-socio' },
  { module: 'asistente', title: 'Asistente', emoji: '🤖', route: '/asistente' },
  { module: 'usuarios', title: 'Miembros', emoji: '👥', route: '/miembros' },
];

export interface VisibleModule extends ModuleEntry {
  /** «Gestión»: the screen shows create, edit and delete actions (HU-ACC-06). */
  canManage: boolean;
}

/**
 * HU-ACC-06: only the modules the profile can at least read. The server is
 * still the authority; this only hides what would answer 403.
 */
export function visibleModules(permissions: MyPermissionsResponse['permissions']): VisibleModule[] {
  return MODULE_ENTRIES.flatMap((entry) => {
    const permission = permissions.find((candidate) => candidate.module === entry.module);
    return permission ? [{ ...entry, canManage: permission.level === 'gestion' }] : [];
  });
}

export function canAccess(
  permissions: MyPermissionsResponse['permissions'] | undefined,
  module: Module,
): boolean {
  return permissions?.some((permission) => permission.module === module) ?? false;
}

/** «Gestión» on the module: create, edit and delete screens exist only then. */
export function canManage(
  permissions: MyPermissionsResponse['permissions'] | undefined,
  module: Module,
): boolean {
  return permissions?.some((p) => p.module === module && p.level === 'gestion') ?? false;
}
