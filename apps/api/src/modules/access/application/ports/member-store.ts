import type { PageRequest } from '../../../../shared/pagination';
import type { MembershipStatus } from '../../domain/membership';

export interface MemberRecord {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  profileId: string;
  profileName: string;
  /** The profile manages users and profiles (BR-ACC-07). */
  isAdmin: boolean;
  status: MembershipStatus;
  isPartner: boolean;
  partnerNumber: string | null;
}

export interface ProfileRecord {
  id: string;
  name: string;
  predefined: boolean;
  isAdmin: boolean;
}

export interface AuditInput {
  actorUserId: string;
  action: string;
  detail: Record<string, unknown>;
}

export interface AuditRecord {
  id: string;
  action: string;
  actorUserId: string | null;
  targetUserId: string;
  detail: unknown;
  createdAt: Date;
}

export interface NewInvitation {
  tokenHash: string;
  expiresAt: Date;
}

/** What a locked decision may change on a membership; it is always audited (US-ACC-12). */
export interface MemberUpdate {
  status?: MembershipStatus;
  profileId?: string;
  /** Replaces the pending invitation; the previous token stops working. */
  invitation?: NewInvitation;
  audit: AuditInput;
}

export interface MemberSnapshot {
  member: MemberRecord;
  activeAdminCount: number;
}

export interface MemberFilter {
  search?: string;
  status?: Exclude<MembershipStatus, 'removed'>;
}

/** Every method is scoped to one cooperative (ADR-003). */
export interface MemberStore {
  /**
   * Members that are not "removed" (US-ACC-10), by name and then membership id. `search`
   * matches name or email, case-insensitive. A keyset page: the cursor is [name, membershipId]
   * of the last row seen and `page.limit` rows are returned at most.
   */
  listMembers(
    cooperativeId: string,
    filter: MemberFilter,
    page: PageRequest,
  ): Promise<MemberRecord[]>;
  /** One member that is not "removed"; null if it does not exist in this cooperative. */
  findMember(cooperativeId: string, membershipId: string): Promise<MemberRecord | null>;
  listProfiles(cooperativeId: string): Promise<ProfileRecord[]>;
  findProfile(cooperativeId: string, profileId: string): Promise<ProfileRecord | null>;
  /**
   * Creates the user if the email is new, then an "invited" membership with
   * its invitation. 'already_member' if the user has a live membership here.
   */
  createInvitedMember(
    cooperativeId: string,
    data: {
      email: string;
      name: string;
      profileId: string;
      isPartner: boolean;
      partnerNumber: string | null;
      invitation: NewInvitation;
      audit: AuditInput;
    },
  ): Promise<{ membershipId: string; userId: string } | 'already_member'>;
  /**
   * Runs `decide` with the cooperative's memberships locked, so rules that
   * count administrators hold under concurrent changes, then persists its result.
   * Null if the membership does not exist in this cooperative.
   */
  updateMember(
    cooperativeId: string,
    membershipId: string,
    decide: (snapshot: MemberSnapshot) => MemberUpdate,
  ): Promise<MemberRecord | null>;
  listAudit(cooperativeId: string, limit: number): Promise<AuditRecord[]>;
  /** An audit event raised by another module (e.g. a cooperative setting), with the actor as subject. */
  recordAudit(cooperativeId: string, targetUserId: string, audit: AuditInput): Promise<void>;
}
