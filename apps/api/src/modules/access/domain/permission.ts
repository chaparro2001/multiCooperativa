import { InvalidPermissionError, ModuleAccessDeniedError } from './errors';

export const MODULES = [
  'announcements',
  'assemblies',
  'documents',
  'invoicing',
  'member-area',
  'assistant',
  'users',
] as const;
export type Module = (typeof MODULES)[number];

/** "No access" is not a level: it is the absence of a permission (BR-ACC-04). */
export const ACCESS_LEVELS = ['read', 'manage'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const SCOPES = ['own', 'all'] as const;
export type Scope = (typeof SCOPES)[number];

export interface Permission {
  readonly module: Module;
  readonly level: AccessLevel;
  readonly scope: Scope;
}

export type AccessDecision =
  { readonly granted: false } | { readonly granted: true; readonly scope: Scope };

/** The only module with per-partner data, hence the only one where "own" makes sense. */
const MODULE_WITH_OWN_SCOPE: Module = 'member-area';

export function createPermission(
  module: Module,
  level: AccessLevel,
  scope: Scope = 'all',
): Permission {
  if (scope === 'own' && module !== MODULE_WITH_OWN_SCOPE) {
    throw new InvalidPermissionError(
      `The "own" scope is only valid in the member area, not in ${module} (BR-ACC-05).`,
    );
  }
  return { module, level, scope };
}

/** Denies by default; "manage" includes "read" (BR-ACC-04). */
export function resolveAccess(
  permissions: readonly Permission[],
  module: Module,
  required: AccessLevel,
): AccessDecision {
  const permission = permissions.find((candidate) => candidate.module === module);
  if (!permission) return { granted: false };
  if (required === 'manage' && permission.level !== 'manage') return { granted: false };
  return { granted: true, scope: permission.scope };
}

/**
 * Guard every use case calls before doing anything (US-ACC-07). Returns the
 * scope the use case must filter by; throws when the profile lacks the module.
 */
export function requireAccess(
  permissions: readonly Permission[],
  module: Module,
  required: AccessLevel,
): Scope {
  const decision = resolveAccess(permissions, module, required);
  if (!decision.granted) throw new ModuleAccessDeniedError(module, required);
  return decision.scope;
}

/** For use cases that change behaviour with the level (e.g. "manage" also sees drafts). */
export function hasAccess(
  permissions: readonly Permission[],
  module: Module,
  required: AccessLevel,
): boolean {
  return resolveAccess(permissions, module, required).granted;
}
