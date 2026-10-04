import type { Module, MyPermissionsResponse } from '@multicooperativa/contracts';

export interface ModuleEntry {
  module: Module;
  title: string;
  /** Screen of the module inside the cooperative. */
  route: `/${string}`;
}

/** Order of the home screen. */
export const MODULE_ENTRIES: readonly ModuleEntry[] = [
  { module: 'comunicados', title: 'Comunicados', route: '/comunicados' },
  { module: 'asambleas', title: 'Asambleas', route: '/asambleas' },
  { module: 'documentos', title: 'Documentos', route: '/documentos' },
  { module: 'facturas', title: 'Facturas y albaranes', route: '/facturas' },
  { module: 'area-socio', title: 'Área del socio', route: '/area-socio' },
  { module: 'asistente', title: 'Asistente', route: '/asistente' },
  { module: 'usuarios', title: 'Miembros', route: '/miembros' },
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
