import type { Module, MyPermissionsResponse } from '@multicooperativa/contracts';

import type { IconName } from '@/ui/paper-settings';

export interface ModuleEntry {
  /** Unique per home tile (key and test id); equals `module` unless a module has several tiles. */
  id: string;
  /** Permission module that decides whether the tile is shown. */
  module: Module;
  /** i18n key of the tile title; defaults to `enums.module.<module>`. */
  titleKey?:
    | 'invoicing.home.invoices'
    | 'invoicing.home.notes'
    | 'invoicing.thirdParties.filter.supplier'
    | 'invoicing.thirdParties.filter.customer';
  /** MaterialCommunityIcons name shown in the home grid; decorative, screen readers read the title (`enums.module.<module>`). */
  icon: IconName;
  /** Screen of the module inside the cooperative. */
  route: `/${string}`;
  /** Not built yet: the home shows a "coming soon" badge and the screen a placeholder. */
  comingSoon?: true;
}

/** Order of the home grid. */
export const MODULE_ENTRIES: readonly ModuleEntry[] = [
  {
    id: 'announcements',
    module: 'announcements',
    icon: 'bullhorn-outline',
    route: '/announcements',
  },
  { id: 'assemblies', module: 'assemblies', icon: 'hand-back-left-outline', route: '/assemblies' },
  { id: 'documents', module: 'documents', icon: 'file-document-outline', route: '/documents' },
  // Invoices and delivery notes share one screen fixed to a kind by the query param (BR-INV-01: same permission).
  {
    id: 'invoices',
    module: 'invoicing',
    titleKey: 'invoicing.home.invoices',
    icon: 'receipt-text-outline',
    route: '/invoices?kind=invoice',
  },
  {
    id: 'delivery-notes',
    module: 'invoicing',
    titleKey: 'invoicing.home.notes',
    icon: 'package-variant-closed',
    route: '/invoices?kind=delivery_note',
  },
  // Suppliers and customers are master data of the invoicing module (BR-INV-01): same permission.
  // One third party can be both (US-INV-01): then it shows in both lists.
  {
    id: 'suppliers',
    module: 'invoicing',
    titleKey: 'invoicing.thirdParties.filter.supplier',
    icon: 'office-building-outline',
    route: '/invoices/third-parties?type=supplier',
  },
  {
    id: 'customers',
    module: 'invoicing',
    titleKey: 'invoicing.thirdParties.filter.customer',
    icon: 'store-outline',
    route: '/invoices/third-parties?type=customer',
  },
  { id: 'member-area', module: 'member-area', icon: 'account-outline', route: '/member-area' },
  { id: 'assistant', module: 'assistant', icon: 'chat-processing-outline', route: '/assistant' },
  { id: 'users', module: 'users', icon: 'account-group-outline', route: '/members' },
];

/** Icon of a home tile, shared by the places that point at the same screen (single source). */
export function moduleIcon(id: string): IconName {
  const entry = MODULE_ENTRIES.find((e) => e.id === id);
  if (!entry) throw new Error(`Unknown module entry: ${id}`);
  return entry.icon;
}

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

/** "All" scope on the module: the screens that list other members exist only then (the server enforces it too). */
export function allScope(
  permissions: MyPermissionsResponse['permissions'] | undefined,
  module: Module,
): boolean {
  return permissions?.some((p) => p.module === module && p.scope === 'all') ?? false;
}
