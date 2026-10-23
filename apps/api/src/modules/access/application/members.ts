import {
  type Page,
  pageRequest,
  TEXT_CURSOR,
  toPage,
  UUID_CURSOR,
} from '../../../shared/pagination';
import { assertKeepsAnAdmin, assertNotSelf } from '../domain/administration';
import { normalizeEmail } from '../domain/email';
import { InvalidMembershipTransitionError } from '../domain/errors';
import { issueInvitation } from '../domain/invitation';
import { parseMemberNif, reactivate, remove, suspend } from '../domain/membership';
import { requireAccess } from '../domain/permission';
import {
  InvitationNotPendingError,
  MemberAlreadyExistsError,
  MemberNifTakenError,
  MemberNotFoundError,
  ProfileNotFoundError,
} from './errors';
import type { InvitationSender } from './ports/invitation-sender';
import type {
  AuditRecord,
  MemberFilter,
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

/** Every member operation requires "Users and profiles · manage". */
function requireUserManagement(context: CooperativeContext): void {
  requireAccess(context.permissions, 'users', 'manage');
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

/** An active administrator is what BR-ACC-07 protects. */
const isActiveAdmin = (member: MemberRecord) => member.status === 'active' && member.isAdmin;

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
      // BR-ACC-08, checked first: nobody modifies their own membership.
      assertNotSelf(context.membershipId, snapshot.member.membershipId);
      return decide(snapshot);
    },
  );
  if (!updated) throw new MemberNotFoundError();
  return updated;
}

const MEMBER_CURSOR = [TEXT_CURSOR, UUID_CURSOR];

/** US-ACC-10: a page of members, by name; `before` is the previous `nextCursor`. */
export async function listMembers(
  deps: Pick<MemberDeps, 'members'>,
  context: CooperativeContext,
  filter: MemberFilter,
  page: { limit: number; before?: string },
): Promise<Page<MemberRecord>> {
  requireUserManagement(context);
  const rows = await deps.members.listMembers(context.cooperativeId, filter, {
    ...pageRequest(page, MEMBER_CURSOR),
    limit: page.limit + 1,
  });
  return toPage(rows, page.limit, (member) => [member.name, member.membershipId]);
}

/** US-ACC-10: one member that has not left, for its detail screen. */
export async function getMember(
  deps: Pick<MemberDeps, 'members'>,
  context: CooperativeContext,
  membershipId: string,
): Promise<MemberRecord> {
  requireUserManagement(context);
  const member = isUuid(membershipId)
    ? await deps.members.findMember(context.cooperativeId, membershipId)
    : null;
  if (!member) throw new MemberNotFoundError();
  return member;
}

export async function listProfiles(
  deps: Pick<MemberDeps, 'members'>,
  context: CooperativeContext,
): Promise<ProfileRecord[]> {
  requireUserManagement(context);
  return deps.members.listProfiles(context.cooperativeId);
}

/** What the inviting administrator gets back; `invitationUrl` only with administrator delivery (ADR-016). */
export interface InvitationIssued {
  expiresAt: Date;
  invitationUrl?: string;
}

export interface InviteMemberInput {
  email: string;
  /** Used only if the email is new on the platform; an existing user keeps theirs. */
  name: string;
  profileId: string;
  isPartner: boolean;
  partnerNumber?: string | null;
  /** ADR-025: optional; normalized and validated like a third party's NIF. */
  nif?: string | null;
}

/** US-ACC-08. */
export async function inviteMember(
  deps: MemberDeps,
  context: CooperativeContext,
  input: InviteMemberInput,
): Promise<InvitationIssued & { membershipId: string }> {
  requireUserManagement(context);
  const profile = await findProfileOrFail(deps, context, input.profileId);

  const email = normalizeEmail(input.email);
  const nif = parseMemberNif(input.nif);
  const token = deps.secrets.generate();
  const { expiresAt } = issueInvitation(deps.now());

  const created = await deps.members.createInvitedMember(context.cooperativeId, {
    email,
    name: input.name.trim(),
    profileId: profile.id,
    isPartner: input.isPartner,
    partnerNumber: input.partnerNumber?.trim() || null,
    nif,
    invitation: { tokenHash: deps.secrets.hash(token), expiresAt },
    audit: {
      actorUserId: context.userId,
      action: 'member.invited',
      detail: { profile: profile.name, isPartner: input.isPartner },
    },
  });
  if (created === 'already_member') throw new MemberAlreadyExistsError();
  if (created === 'nif_taken') throw new MemberNifTakenError();

  const delivery = await deps.invitationSender.send({
    email,
    cooperativeId: context.cooperativeId,
    token,
    expiresAt,
  });
  return {
    membershipId: created.membershipId,
    expiresAt,
    ...(delivery?.invitationUrl && { invitationUrl: delivery.invitationUrl }),
  };
}

export type MemberChange =
  | { profileId: string }
  | { status: 'active' | 'suspended' }
  /** ADR-025: sets the partner's NIF, or clears it with null. */
  | { nif: string | null };

/** US-ACC-09 (profile) and US-ACC-10 (suspend, reactivate). */
export async function changeMember(
  deps: Pick<MemberDeps, 'members'>,
  context: CooperativeContext,
  membershipId: string,
  change: MemberChange,
): Promise<MemberRecord> {
  requireUserManagement(context);
  const newNif = 'nif' in change ? parseMemberNif(change.nif) : undefined;
  const newProfile =
    'profileId' in change ? await findProfileOrFail(deps, context, change.profileId) : null;

  return updateOrFail(deps, context, membershipId, ({ member, activeAdminCount }) => {
    const audit = (action: string, before: object, after: object) => ({
      actorUserId: context.userId,
      action,
      detail: { before, after },
    });

    if ('nif' in change) {
      if (member.status === 'removed') {
        throw new InvalidMembershipTransitionError(
          'The NIF of a removed membership cannot be changed.',
        );
      }
      return {
        nif: newNif ?? null,
        // The tax id is personal data: the audit says it changed, not what it was.
        audit: audit(
          'member.nif_changed',
          { hasNif: member.nif !== null },
          { hasNif: newNif != null },
        ),
      };
    }

    if (newProfile) {
      if (member.status === 'removed') {
        throw new InvalidMembershipTransitionError(
          'The profile of a removed membership cannot be changed.',
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

    if ('status' in change && change.status === 'suspended') {
      suspend(member);
      assertKeepsAnAdmin({ targetIsActiveAdmin: isActiveAdmin(member), activeAdminCount });
      return {
        status: 'suspended',
        audit: audit('member.suspended', { status: member.status }, { status: 'suspended' }),
      };
    }

    reactivate(member);
    return {
      status: 'active',
      audit: audit('member.reactivated', { status: member.status }, { status: 'active' }),
    };
  });
}

/** US-ACC-10: definitive; the membership stays as "removed" and keeps its history (BR-ACC-14). */
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
      status: 'removed',
      audit: {
        actorUserId: context.userId,
        action: 'member.removed',
        detail: { before: { status: member.status }, after: { status: 'removed' } },
      },
    };
  });
}

/** US-ACC-08: a new single-use link; the previous one stops working. */
export async function resendInvitation(
  deps: MemberDeps,
  context: CooperativeContext,
  membershipId: string,
): Promise<InvitationIssued> {
  requireUserManagement(context);
  const token = deps.secrets.generate();
  const { expiresAt } = issueInvitation(deps.now());

  const member = await updateOrFail(deps, context, membershipId, ({ member }) => {
    if (member.status !== 'invited') throw new InvitationNotPendingError();
    return {
      invitation: { tokenHash: deps.secrets.hash(token), expiresAt },
      audit: { actorUserId: context.userId, action: 'member.invitation_resent', detail: {} },
    };
  });

  const delivery = await deps.invitationSender.send({
    email: member.email,
    cooperativeId: context.cooperativeId,
    token,
    expiresAt,
  });
  return { expiresAt, ...(delivery?.invitationUrl && { invitationUrl: delivery.invitationUrl }) };
}

/** US-ACC-12: only this cooperative's events, newest first. */
export async function listAudit(
  deps: Pick<MemberDeps, 'members'>,
  context: CooperativeContext,
): Promise<AuditRecord[]> {
  requireUserManagement(context);
  return deps.members.listAudit(context.cooperativeId, AUDIT_PAGE_SIZE);
}
