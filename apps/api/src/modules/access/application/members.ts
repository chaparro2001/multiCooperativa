import { assertKeepsAnAdmin, assertNotSelf } from '../domain/administration';
import { normalizeEmail } from '../domain/email';
import { InvalidMembershipTransitionError } from '../domain/errors';
import { issueInvitation } from '../domain/invitation';
import { reactivate, remove, suspend } from '../domain/membership';
import { requireAccess } from '../domain/permission';
import {
  InvitationNotPendingError,
  MemberAlreadyExistsError,
  MemberNotFoundError,
  ProfileNotFoundError,
} from './errors';
import type { InvitationSender } from './ports/invitation-sender';
import type {
  AuditRecord,
  MemberRecord,
  MemberSnapshot,
  MemberStore,
  MemberUpdate,
  ProfileRecord,
} from './ports/member-store';
import type { SecretTokens } from './ports/tokens';
import type { CooperativeContext } from './request-context';
import { isUuid } from './uuid';

export interface MemberDeps {
  members: MemberStore;
  secrets: SecretTokens;
  invitationSender: InvitationSender;
  now: () => Date;
}

export const AUDIT_PAGE_SIZE = 100;

/** Every member operation requires «Usuarios y perfiles · gestión». */
function requireUserManagement(context: CooperativeContext): void {
  requireAccess(context.permissions, 'usuarios', 'gestion');
}

async function findProfileOrFail(
  deps: Pick<MemberDeps, 'members'>,
  context: CooperativeContext,
  profileId: string,
): Promise<ProfileRecord> {
  const profile = isUuid(profileId)
    ? await deps.members.findProfile(context.cooperativeId, profileId)
    : null;
  if (!profile) throw new ProfileNotFoundError();
  return profile;
}

/** An active administrator is what RN-ACC-07 protects. */
const isActiveAdmin = (member: MemberRecord) => member.status === 'activa' && member.isAdmin;

async function updateOrFail(
  deps: Pick<MemberDeps, 'members'>,
  context: CooperativeContext,
  membershipId: string,
  decide: (snapshot: MemberSnapshot) => MemberUpdate,
): Promise<MemberRecord> {
  if (!isUuid(membershipId)) throw new MemberNotFoundError();
  const updated = await deps.members.updateMember(
    context.cooperativeId,
    membershipId,
    (snapshot) => {
      // RN-ACC-08, checked first: nobody modifies their own membership.
      assertNotSelf(context.membershipId, snapshot.member.membershipId);
      return decide(snapshot);
    },
  );
  if (!updated) throw new MemberNotFoundError();
  return updated;
}

export async function listMembers(
  deps: Pick<MemberDeps, 'members'>,
  context: CooperativeContext,
): Promise<MemberRecord[]> {
  requireUserManagement(context);
  return deps.members.listMembers(context.cooperativeId);
}

export async function listProfiles(
  deps: Pick<MemberDeps, 'members'>,
  context: CooperativeContext,
): Promise<ProfileRecord[]> {
  requireUserManagement(context);
  return deps.members.listProfiles(context.cooperativeId);
}

export interface InviteMemberInput {
  email: string;
  /** Used only if the email is new on the platform; an existing user keeps theirs. */
  name: string;
  profileId: string;
  isPartner: boolean;
  partnerNumber?: string | null;
}

/** HU-ACC-08. */
export async function inviteMember(
  deps: MemberDeps,
  context: CooperativeContext,
  input: InviteMemberInput,
): Promise<{ membershipId: string }> {
  requireUserManagement(context);
  const profile = await findProfileOrFail(deps, context, input.profileId);

  const email = normalizeEmail(input.email);
  const token = deps.secrets.generate();
  const { expiresAt } = issueInvitation(deps.now());

  const created = await deps.members.createInvitedMember(context.cooperativeId, {
    email,
    name: input.name.trim(),
    profileId: profile.id,
    isPartner: input.isPartner,
    partnerNumber: input.partnerNumber?.trim() || null,
    invitation: { tokenHash: deps.secrets.hash(token), expiresAt },
    audit: {
      actorUserId: context.userId,
      action: 'member.invited',
      detail: { profile: profile.name, isPartner: input.isPartner },
    },
  });
  if (created === 'already_member') throw new MemberAlreadyExistsError();

  await deps.invitationSender.send({
    email,
    cooperativeId: context.cooperativeId,
    token,
    expiresAt,
  });
  return { membershipId: created.membershipId };
}

export type MemberChange = { profileId: string } | { status: 'activa' | 'suspendida' };

/** HU-ACC-09 (profile) and HU-ACC-10 (suspend, reactivate). */
export async function changeMember(
  deps: Pick<MemberDeps, 'members'>,
  context: CooperativeContext,
  membershipId: string,
  change: MemberChange,
): Promise<MemberRecord> {
  requireUserManagement(context);
  const newProfile =
    'profileId' in change ? await findProfileOrFail(deps, context, change.profileId) : null;

  return updateOrFail(deps, context, membershipId, ({ member, activeAdminCount }) => {
    const audit = (action: string, before: object, after: object) => ({
      actorUserId: context.userId,
      action,
      detail: { before, after },
    });

    if (newProfile) {
      if (member.status === 'baja') {
        throw new InvalidMembershipTransitionError(
          'No se puede cambiar el perfil de una membresía dada de baja.',
        );
      }
      assertKeepsAnAdmin({
        targetIsActiveAdmin: isActiveAdmin(member) && !newProfile.isAdmin,
        activeAdminCount,
      });
      return {
        profileId: newProfile.id,
        audit: audit(
          'member.profile_changed',
          { profile: member.profileName },
          { profile: newProfile.name },
        ),
      };
    }

    if ('status' in change && change.status === 'suspendida') {
      suspend(member);
      assertKeepsAnAdmin({ targetIsActiveAdmin: isActiveAdmin(member), activeAdminCount });
      return {
        status: 'suspendida',
        audit: audit('member.suspended', { status: member.status }, { status: 'suspendida' }),
      };
    }

    reactivate(member);
    return {
      status: 'activa',
      audit: audit('member.reactivated', { status: member.status }, { status: 'activa' }),
    };
  });
}

/** HU-ACC-10: definitive; the membership stays as "baja" and keeps its history (RN-ACC-14). */
export async function removeMember(
  deps: Pick<MemberDeps, 'members'>,
  context: CooperativeContext,
  membershipId: string,
): Promise<MemberRecord> {
  requireUserManagement(context);
  return updateOrFail(deps, context, membershipId, ({ member, activeAdminCount }) => {
    remove(member);
    assertKeepsAnAdmin({ targetIsActiveAdmin: isActiveAdmin(member), activeAdminCount });
    return {
      status: 'baja',
      audit: {
        actorUserId: context.userId,
        action: 'member.removed',
        detail: { before: { status: member.status }, after: { status: 'baja' } },
      },
    };
  });
}

/** HU-ACC-08: a new single-use link; the previous one stops working. */
export async function resendInvitation(
  deps: MemberDeps,
  context: CooperativeContext,
  membershipId: string,
): Promise<void> {
  requireUserManagement(context);
  const token = deps.secrets.generate();
  const { expiresAt } = issueInvitation(deps.now());

  const member = await updateOrFail(deps, context, membershipId, ({ member }) => {
    if (member.status !== 'invitada') throw new InvitationNotPendingError();
    return {
      invitation: { tokenHash: deps.secrets.hash(token), expiresAt },
      audit: { actorUserId: context.userId, action: 'member.invitation_resent', detail: {} },
    };
  });

  await deps.invitationSender.send({
    email: member.email,
    cooperativeId: context.cooperativeId,
    token,
    expiresAt,
  });
}

/** HU-ACC-12: only this cooperative's events, newest first. */
export async function listAudit(
  deps: Pick<MemberDeps, 'members'>,
  context: CooperativeContext,
): Promise<AuditRecord[]> {
  requireUserManagement(context);
  return deps.members.listAudit(context.cooperativeId, AUDIT_PAGE_SIZE);
}
