import type { Permission } from '../../domain/permission';

export interface ActiveMembership {
  membershipId: string;
  profileName: string;
  isPartner: boolean;
  permissions: Permission[];
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  memberships: {
    membershipId: string;
    cooperativeId: string;
    cooperativeName: string;
    profileName: string;
    isPartner: boolean;
  }[];
}

/** Reads that build the context of each request. */
export interface AccessContextStore {
  /** Only an active membership counts: any other status grants nothing (RN-ACC-09). */
  findActiveMembership(userId: string, cooperativeId: string): Promise<ActiveMembership | null>;
  /** The user's own data and active memberships across cooperatives. */
  findUserSummary(userId: string): Promise<UserSummary | null>;
}
