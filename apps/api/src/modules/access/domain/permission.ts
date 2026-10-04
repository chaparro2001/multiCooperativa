import { InvalidPermissionError, ModuleAccessDeniedError } from './errors';

export const MODULES = [
  'comunicados',
  'asambleas',
  'documentos',
  'facturas',
  'area-socio',
  'asistente',
  'usuarios',
] as const;
export type Module = (typeof MODULES)[number];

/** "Sin acceso" is not a level: it is the absence of a permission (RN-ACC-04). */
export const ACCESS_LEVELS = ['consulta', 'gestion'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const SCOPES = ['propias', 'todas'] as const;
export type Scope = (typeof SCOPES)[number];

export interface Permission {
  readonly module: Module;
  readonly level: AccessLevel;
  readonly scope: Scope;
}

export type AccessDecision =
  { readonly granted: false } | { readonly granted: true; readonly scope: Scope };

/** The only module with per-partner data, hence the only one where "propias" makes sense. */
const MODULE_WITH_OWN_SCOPE: Module = 'area-socio';

export function createPermission(
  module: Module,
  level: AccessLevel,
  scope: Scope = 'todas',
): Permission {
  if (scope === 'propias' && module !== MODULE_WITH_OWN_SCOPE) {
    throw new InvalidPermissionError(
      `El alcance «propias» solo es válido en el Área del socio, no en ${module} (RN-ACC-05).`,
    );
  }
  return { module, level, scope };
}

/** Denies by default; "gestion" includes "consulta" (RN-ACC-04). */
export function resolveAccess(
  permissions: readonly Permission[],
  module: Module,
  required: AccessLevel,
): AccessDecision {
  const permission = permissions.find((candidate) => candidate.module === module);
  if (!permission) return { granted: false };
  if (required === 'gestion' && permission.level !== 'gestion') return { granted: false };
  return { granted: true, scope: permission.scope };
}

/**
 * Guard every use case calls before doing anything (HU-ACC-07). Returns the
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
