import { z } from 'zod';

export const moduleSchema = z.enum([
  'announcements',
  'assemblies',
  'documents',
  'invoicing',
  'member-area',
  'assistant',
  'users',
]);

export const accessLevelSchema = z.enum(['read', 'manage']);

export const scopeSchema = z.enum(['own', 'all']);

/** GET /me: the user and the cooperatives they can enter (US-ACC-05). */
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
 * GET /cooperatives/{id}/me/permissions: the app builds its navigation from this
 * (US-ACC-06). A missing module means "no access".
 */
export const myPermissionsResponseSchema = z.object({
  cooperativeId: z.uuid(),
  profileName: z.string(),
  isPartner: z.boolean(),
  permissions: z.array(
    z.object({ module: moduleSchema, level: accessLevelSchema, scope: scopeSchema }),
  ),
});

export const membershipStatusSchema = z.enum(['invited', 'active', 'suspended', 'removed']);

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

/** GET /cooperatives/{id}/members: everyone except removed members (US-ACC-10). */
export const listMembersResponseSchema = z.object({ members: z.array(memberSchema) });

export const profileSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  predefined: z.boolean(),
});

export const listProfilesResponseSchema = z.object({ profiles: z.array(profileSchema) });

/** POST /cooperatives/{id}/members (US-ACC-08). */
export const inviteMemberRequestSchema = z.object({
  email: z.string().trim().pipe(z.email()),
  /** Only used if the email is new to the platform. */
  name: z.string().trim().min(1).max(200),
  profileId: z.uuid(),
  isPartner: z.boolean(),
  partnerNumber: z.string().trim().max(50).nullable().optional(),
});

export const inviteMemberResponseSchema = z.object({ membershipId: z.uuid() });

/** PATCH /cooperatives/{id}/members/{memberId}: one change at a time (US-ACC-09, US-ACC-10). */
export const updateMemberRequestSchema = z.union([
  z.strictObject({ profileId: z.uuid() }),
  z.strictObject({ status: z.enum(['active', 'suspended']) }),
]);

export const auditEventSchema = z.object({
  id: z.uuid(),
  action: z.string(),
  /** Null if a platform script did it. */
  actorUserId: z.uuid().nullable(),
  targetUserId: z.uuid(),
  detail: z.unknown(),
  createdAt: z.iso.datetime(),
});

/** GET /cooperatives/{id}/audit: the latest events, newest first. */
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
