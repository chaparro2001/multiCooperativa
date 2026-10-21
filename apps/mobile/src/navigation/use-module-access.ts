import type { Module } from '@multicooperativa/contracts';

import { useActiveCooperative } from '@/cooperatives/active-cooperative';

/** What the profile allows in a module; the server enforces it anyway (US-ACC-06). */
export function useModuleAccess(module: Module): {
  canRead: boolean;
  canManage: boolean;
  /** "own" = only the user's own data (member area), "all" = everyone's; null without access. */
  scope: 'own' | 'all' | null;
} {
  const { permissions } = useActiveCooperative();
  const permission = permissions?.permissions.find((p) => p.module === module);
  return {
    canRead: Boolean(permission),
    canManage: permission?.level === 'manage',
    scope: permission?.scope ?? null,
  };
}
