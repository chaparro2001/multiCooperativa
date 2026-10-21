/** A member as the access module reports them, through its public interface. */
export interface MemberRecord {
  membershipId: string;
  name: string;
  email: string;
  partnerNumber: string | null;
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
}
