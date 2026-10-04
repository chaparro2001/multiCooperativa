import type { PredefinedProfile, PredefinedProfileName } from '../../domain/predefined-profiles';

export type ProvisionedAdmin =
  | { kind: 'existing'; userId: string }
  | { kind: 'new'; email: string; name: string; passwordHash: string };

export interface ProvisionCooperativeData {
  name: string;
  cif: string;
  profiles: readonly PredefinedProfile[];
  adminProfileName: PredefinedProfileName;
  admin: ProvisionedAdmin;
}

export interface ProvisionCooperativeResult {
  cooperativeId: string;
  adminUserId: string;
  adminMembershipId: string;
}

/**
 * Platform-level persistence for creating a cooperative. It is the one place
 * that works without a cooperative context, because the cooperative does not exist yet.
 */
export interface CooperativeProvisioningStore {
  findUserByEmail(email: string): Promise<{ id: string; hasPassword: boolean } | null>;
  cooperativeExistsByCif(cif: string): Promise<boolean>;
  /** Creates everything atomically. */
  provision(data: ProvisionCooperativeData): Promise<ProvisionCooperativeResult>;
}
