/** A member as the access module reports them, through its public interface. */
export interface MemberRecord {
  membershipId: string;
  name: string;
  email: string;
  partnerNumber: string | null;
  /** Normalized tax id (ADR-025). */
  nif: string | null;
  isPartner: boolean;
  status: 'invited' | 'active' | 'suspended' | 'removed';
  profileName: string;
  joinedAt: Date;
}

/** What the member area needs from the access module. Always scoped to a cooperative. */
export interface MemberDirectory {
  /** Any status; null when the membership is not in this cooperative. */
  findMember(cooperativeId: string, membershipId: string): Promise<MemberRecord | null>;
  /** Partners that have not left. */
  listPartners(cooperativeId: string): Promise<MemberRecord[]>;
  /**
   * Head counts of the partners (ADR-025). `from` and `to` are YYYY-MM-DD, inclusive; a missing
   * bound is open. Joined: by joining date; left: removed ones, by the day they left.
   */
  partnerCensus(
    cooperativeId: string,
    period: { from?: string; to?: string },
  ): Promise<PartnerCensus>;
}

export interface PartnerCensus {
  /** Active partners now. */
  activePartners: number;
  /** Partners invited that have not accepted the invitation yet. */
  invitedNotActivated: number;
  /** Suspended partners now. */
  suspendedPartners: number;
  joinedInPeriod: number;
  leftInPeriod: number;
}
