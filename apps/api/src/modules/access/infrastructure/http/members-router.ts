import {
  inviteMemberRequestSchema,
  type InviteMemberResponse,
  type ListAuditResponse,
  type ListMembersResponse,
  type ListProfilesResponse,
  type Member,
  updateMemberRequestSchema,
} from '@multicooperativa/contracts';
import { type RequestHandler, Router } from 'express';

import { parseBody } from '../../../../shared/infrastructure/http/validation';
import type { InviteMemberInput, MemberChange } from '../../application/members';
import type {
  AuditRecord,
  MemberRecord,
  ProfileRecord,
} from '../../application/ports/member-store';
import type { CooperativeContext } from '../../application/request-context';
import { getCooperativeContext, requirePermission } from './access-middleware';

export interface MemberUseCases {
  listMembers(context: CooperativeContext): Promise<MemberRecord[]>;
  listProfiles(context: CooperativeContext): Promise<ProfileRecord[]>;
  inviteMember(
    context: CooperativeContext,
    input: InviteMemberInput,
  ): Promise<{ membershipId: string }>;
  changeMember(
    context: CooperativeContext,
    membershipId: string,
    change: MemberChange,
  ): Promise<MemberRecord>;
  removeMember(context: CooperativeContext, membershipId: string): Promise<MemberRecord>;
  resendInvitation(context: CooperativeContext, membershipId: string): Promise<void>;
  listAudit(context: CooperativeContext): Promise<AuditRecord[]>;
}

/** The admin flag is internal (RN-ACC-07); the app sees the profile name. */
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

/** HU-ACC-08 to HU-ACC-12. Every route requires «Usuarios y perfiles · gestión». */
export function createMembersRouter(
  useCases: MemberUseCases,
  requireCooperative: RequestHandler,
): Router {
  const router = Router();
  const base = '/cooperativas/:cooperativeId';
  const guard = [requireCooperative, requirePermission('usuarios', 'gestion')];

  router.get(`${base}/perfiles`, ...guard, async (_req, res) => {
    const profiles = await useCases.listProfiles(getCooperativeContext(res));
    res.json({
      profiles: profiles.map(({ id, name, predefined }) => ({ id, name, predefined })),
    } satisfies ListProfilesResponse);
  });

  router.get(`${base}/miembros`, ...guard, async (_req, res) => {
    const members = await useCases.listMembers(getCooperativeContext(res));
    res.json({ members: members.map(toMember) } satisfies ListMembersResponse);
  });

  router.post(`${base}/miembros`, ...guard, async (req, res) => {
    const input = parseBody(inviteMemberRequestSchema, req.body);
    const created = await useCases.inviteMember(getCooperativeContext(res), input);
    res.status(201).json(created satisfies InviteMemberResponse);
  });

  router.patch(`${base}/miembros/:memberId`, ...guard, async (req, res) => {
    const change = parseBody(updateMemberRequestSchema, req.body);
    const member = await useCases.changeMember(
      getCooperativeContext(res),
      String(req.params.memberId),
      change,
    );
    res.json(toMember(member));
  });

  router.post(`${base}/miembros/:memberId/baja`, ...guard, async (req, res) => {
    const member = await useCases.removeMember(
      getCooperativeContext(res),
      String(req.params.memberId),
    );
    res.json(toMember(member));
  });

  router.post(`${base}/miembros/:memberId/invitacion`, ...guard, async (req, res) => {
    await useCases.resendInvitation(getCooperativeContext(res), String(req.params.memberId));
    res.status(204).end();
  });

  router.get(`${base}/auditoria`, ...guard, async (_req, res) => {
    const events = await useCases.listAudit(getCooperativeContext(res));
    res.json({
      events: events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
    } satisfies ListAuditResponse);
  });

  return router;
}
