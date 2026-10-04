import type { Module } from '@multicooperativa/contracts';

import { useActiveCooperative } from '@/cooperatives/active-cooperative';

/** What the profile allows in a module; the server enforces it anyway (HU-ACC-06). */
export function useModuleAccess(module: Module): { canRead: boolean; canManage: boolean } {
  const { permissions } = useActiveCooperative();
  const permission = permissions?.permissions.find((p) => p.module === module);
  return { canRead: Boolean(permission), canManage: permission?.level === 'gestion' };
}
