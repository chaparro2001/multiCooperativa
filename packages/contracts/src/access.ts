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

export const membershipStatusSchema = z.enum(['invitada', 'activa', 'suspendida', 'baja']);

export const memberSchema = z.object({
  membershipId: z.uuid(),
  userId: z.uuid(),
  email: z.string(),
  name: z.string(),
  profileId: z.uuid(),
  profileName: z.string(),
  status: membershipStatusSchema,
  isPartner: z.boolean(),
  partnerNumber: z.string().nullable(),
});

/** GET /cooperativas/{id}/miembros: todos salvo los dados de baja (HU-ACC-10). */
export const listMembersResponseSchema = z.object({ members: z.array(memberSchema) });

export const profileSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  predefined: z.boolean(),
});

export const listProfilesResponseSchema = z.object({ profiles: z.array(profileSchema) });

/** POST /cooperativas/{id}/miembros (HU-ACC-08). */
export const inviteMemberRequestSchema = z.object({
  email: z.string().trim().pipe(z.email()),
  /** Solo se usa si el email es nuevo en la plataforma. */
  name: z.string().trim().min(1).max(200),
  profileId: z.uuid(),
  isPartner: z.boolean(),
  partnerNumber: z.string().trim().max(50).nullable().optional(),
});

export const inviteMemberResponseSchema = z.object({ membershipId: z.uuid() });

/** PATCH /cooperativas/{id}/miembros/{miembroId}: un cambio cada vez (HU-ACC-09, HU-ACC-10). */
export const updateMemberRequestSchema = z.union([
  z.strictObject({ profileId: z.uuid() }),
  z.strictObject({ status: z.enum(['activa', 'suspendida']) }),
]);

export const auditEventSchema = z.object({
  id: z.uuid(),
  action: z.string(),
  /** Nulo si lo hizo un script de plataforma. */
  actorUserId: z.uuid().nullable(),
  targetUserId: z.uuid(),
  detail: z.unknown(),
  createdAt: z.iso.datetime(),
});

/** GET /cooperativas/{id}/auditoria: los últimos eventos, del más reciente al más antiguo. */
export const listAuditResponseSchema = z.object({ events: z.array(auditEventSchema) });

export type Module = z.infer<typeof moduleSchema>;
export type AccessLevel = z.infer<typeof accessLevelSchema>;
export type Scope = z.infer<typeof scopeSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type MyPermissionsResponse = z.infer<typeof myPermissionsResponseSchema>;

export type MembershipStatus = z.infer<typeof membershipStatusSchema>;
export type Member = z.infer<typeof memberSchema>;
export type ListMembersResponse = z.infer<typeof listMembersResponseSchema>;
export type ListProfilesResponse = z.infer<typeof listProfilesResponseSchema>;
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;
export type InviteMemberResponse = z.infer<typeof inviteMemberResponseSchema>;
export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type ListAuditResponse = z.infer<typeof listAuditResponseSchema>;
