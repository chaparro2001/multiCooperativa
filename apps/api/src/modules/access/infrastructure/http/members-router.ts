import {
  inviteMemberRequestSchema,
  listMembersQuerySchema,
  type InviteMemberResponse,
  type ListAuditResponse,
  type ListMembersResponse,
  type ListProfilesResponse,
  type Member,
  type ResendInvitationResponse,
  updateMemberRequestSchema,
} from '@multicooperativa/contracts';
import { type RequestHandler, Router } from 'express';

import { parseBody } from '../../../../shared/infrastructure/http/validation';
import type { Page } from '../../../../shared/pagination';
import type { InvitationIssued, InviteMemberInput, MemberChange } from '../../application/members';
import type {
  AuditRecord,
  MemberFilter,
  MemberRecord,
  ProfileRecord,
} from '../../application/ports/member-store';
import type { CooperativeContext } from '../../application/request-context';
import { getCooperativeContext, requirePermission } from './access-middleware';

export interface MemberUseCases {
  listMembers(
    context: CooperativeContext,
    filter: MemberFilter,
    page: { limit: number; before?: string },
  ): Promise<Page<MemberRecord>>;
  getMember(context: CooperativeContext, membershipId: string): Promise<MemberRecord>;
  listProfiles(context: CooperativeContext): Promise<ProfileRecord[]>;
  inviteMember(
    context: CooperativeContext,
    input: InviteMemberInput,
  ): Promise<InvitationIssued & { membershipId: string }>;
  changeMember(
    context: CooperativeContext,
    membershipId: string,
    change: MemberChange,
  ): Promise<MemberRecord>;
  removeMember(context: CooperativeContext, membershipId: string): Promise<MemberRecord>;
  resendInvitation(context: CooperativeContext, membershipId: string): Promise<InvitationIssued>;
  listAudit(context: CooperativeContext): Promise<AuditRecord[]>;
}

/** The admin flag is internal (BR-ACC-07); the app sees the profile name. */
function toMember(member: MemberRecord): Member {
  return {
    membershipId: member.membershipId,
    userId: member.userId,
    email: member.email,
    name: member.name,
    profileId: member.profileId,
    profileName: member.profileName,
    status: member.status,
    isPartner: member.isPartner,
    partnerNumber: member.partnerNumber,
  };
}

/** The link travels only to the administrator who issued it: every route here requires users:manage (ADR-016). */
function toInvitation<T extends InvitationIssued>({ expiresAt, invitationUrl, ...rest }: T) {
  return { ...rest, expiresAt: expiresAt.toISOString(), ...(invitationUrl && { invitationUrl }) };
}

/** US-ACC-08 to US-ACC-12. Every route requires "Users and profiles · manage". */
export function createMembersRouter(
  useCases: MemberUseCases,
  requireCooperative: RequestHandler,
): Router {
  const router = Router();
  const base = '/cooperatives/:cooperativeId';
  const guard = [requireCooperative, requirePermission('users', 'manage')];

  router.get(`${base}/profiles`, ...guard, async (_req, res) => {
    const profiles = await useCases.listProfiles(getCooperativeContext(res));
    res.json({
      profiles: profiles.map(({ id, name, predefined }) => ({ id, name, predefined })),
    } satisfies ListProfilesResponse);
  });

  router.get(`${base}/members`, ...guard, async (req, res) => {
    const q = parseBody(listMembersQuerySchema, req.query);
    const page = await useCases.listMembers(
      getCooperativeContext(res),
      { search: q.q || undefined, status: q.status },
      { limit: q.limit, before: q.before },
    );
    res.json({
      items: page.items.map(toMember),
      nextCursor: page.nextCursor,
    } satisfies ListMembersResponse);
  });

  router.get(`${base}/members/:memberId`, ...guard, async (req, res) => {
    const member = await useCases.getMember(
      getCooperativeContext(res),
      String(req.params.memberId),
    );
    res.json(toMember(member));
  });

  router.post(`${base}/members`, ...guard, async (req, res) => {
    const input = parseBody(inviteMemberRequestSchema, req.body);
    const created = await useCases.inviteMember(getCooperativeContext(res), input);
    res.status(201).json(toInvitation(created) satisfies InviteMemberResponse);
  });

  router.patch(`${base}/members/:memberId`, ...guard, async (req, res) => {
    const change = parseBody(updateMemberRequestSchema, req.body);
    const member = await useCases.changeMember(
      getCooperativeContext(res),
      String(req.params.memberId),
      change,
    );
    res.json(toMember(member));
  });

  router.post(`${base}/members/:memberId/removal`, ...guard, async (req, res) => {
    const member = await useCases.removeMember(
      getCooperativeContext(res),
      String(req.params.memberId),
    );
    res.json(toMember(member));
  });

  router.post(`${base}/members/:memberId/invitation`, ...guard, async (req, res) => {
    const issued = await useCases.resendInvitation(
      getCooperativeContext(res),
      String(req.params.memberId),
    );
    res.json(toInvitation(issued) satisfies ResendInvitationResponse);
  });

  router.get(`${base}/audit`, ...guard, async (_req, res) => {
    const events = await useCases.listAudit(getCooperativeContext(res));
    res.json({
      events: events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
    } satisfies ListAuditResponse);
  });

  return router;
}
