import type {
  Permission as PermissionRow,
  PermissionModule as ModuleColumn,
} from '../../../generated/prisma/client';
import { createPermission, type Module, type Permission } from '../domain/permission';

// The database enum cannot contain a hyphen; the domain and the API use "area-socio".
const TO_COLUMN: Record<Module, ModuleColumn> = {
  comunicados: 'comunicados',
  asambleas: 'asambleas',
  documentos: 'documentos',
  facturas: 'facturas',
  'area-socio': 'area_socio',
  asistente: 'asistente',
  usuarios: 'usuarios',
};

const TO_DOMAIN = Object.fromEntries(
  Object.entries(TO_COLUMN).map(([module, column]) => [column, module]),
) as Record<ModuleColumn, Module>;

export function toPermissionColumns(
  permission: Permission,
): Pick<PermissionRow, 'module' | 'level' | 'scope'> {
  return { module: TO_COLUMN[permission.module], level: permission.level, scope: permission.scope };
}

export function toDomainPermission(
  row: Pick<PermissionRow, 'module' | 'level' | 'scope'>,
): Permission {
  return createPermission(TO_DOMAIN[row.module], row.level, row.scope);
}
