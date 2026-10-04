import { z } from 'zod';

export const moduleSchema = z.enum([
  'comunicados',
  'asambleas',
  'documentos',
  'facturas',
  'area-socio',
  'asistente',
  'usuarios',
]);

export const accessLevelSchema = z.enum(['consulta', 'gestion']);

export const scopeSchema = z.enum(['propias', 'todas']);

/** GET /me: datos del usuario y cooperativas en las que puede entrar (HU-ACC-05). */
export const meResponseSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  memberships: z.array(
    z.object({
      membershipId: z.uuid(),
      cooperativeId: z.uuid(),
      cooperativeName: z.string(),
      profileName: z.string(),
      isPartner: z.boolean(),
    }),
  ),
});

/**
 * GET /cooperativas/{id}/me/permisos: con esto la app construye la navegación
 * (HU-ACC-06). Un módulo ausente es «sin acceso».
 */
export const myPermissionsResponseSchema = z.object({
  cooperativeId: z.uuid(),
  profileName: z.string(),
  isPartner: z.boolean(),
  permissions: z.array(
    z.object({ module: moduleSchema, level: accessLevelSchema, scope: scopeSchema }),
  ),
});

export type Module = z.infer<typeof moduleSchema>;
export type AccessLevel = z.infer<typeof accessLevelSchema>;
export type Scope = z.infer<typeof scopeSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type MyPermissionsResponse = z.infer<typeof myPermissionsResponseSchema>;
