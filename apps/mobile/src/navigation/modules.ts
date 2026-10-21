import type { Module, MyPermissionsResponse } from '@multicooperativa/contracts';

export interface ModuleEntry {
  /** Unique per home tile (key and test id); equals `module` unless a module has several tiles. */
  id: string;
  /** Permission module that decides whether the tile is shown. */
  module: Module;
  /** i18n key of the tile title; defaults to `enums.module.<module>`. */
  titleKey?: 'invoicing.thirdParties.filter.supplier' | 'invoicing.thirdParties.filter.customer';
  /** Shown in the home grid; decorative, screen readers read the title (`enums.module.<module>`). */
  emoji: string;
  /** Screen of the module inside the cooperative. */
  route: `/${string}`;
  /** Not built yet: the home shows a "coming soon" badge and the screen a placeholder. */
  comingSoon?: true;
}

/** Order of the home grid. */
export const MODULE_ENTRIES: readonly ModuleEntry[] = [
  { id: 'announcements', module: 'announcements', emoji: '📢', route: '/announcements' },
  { id: 'assemblies', module: 'assemblies', emoji: '🗳️', route: '/assemblies' },
  { id: 'documents', module: 'documents', emoji: '📄', route: '/documents' },
  { id: 'invoicing', module: 'invoicing', emoji: '🧾', route: '/invoices' },
  // Suppliers and customers are master data of the invoicing module (BR-INV-01): same permission.
  // One third party can be both (US-INV-01): then it shows in both lists.
  {
    id: 'suppliers',
    module: 'invoicing',
    titleKey: 'invoicing.thirdParties.filter.supplier',
    emoji: '🚚',
    route: '/invoices/third-parties?type=supplier',
  },
  {
    id: 'customers',
    module: 'invoicing',
    titleKey: 'invoicing.thirdParties.filter.customer',
    emoji: '🤝',
    route: '/invoices/third-parties?type=customer',
  },
  {
    id: 'member-area',
    module: 'member-area',
    emoji: '👤',
    route: '/member-area',
    comingSoon: true,
  },
  { id: 'assistant', module: 'assistant', emoji: '🤖', route: '/assistant' },
  { id: 'users', module: 'users', emoji: '👥', route: '/members', comingSoon: true },
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
