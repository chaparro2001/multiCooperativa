export interface UserCredentials {
  id: string;
  /** Null until the user accepts their first invitation. */
  passwordHash: string | null;
}

/** Platform-level reads for logging in: the user does not have a cooperative context yet. */
export interface LoginStore {
  findCredentialsByEmail(email: string): Promise<UserCredentials | null>;
  countActiveMemberships(userId: string): Promise<number>;
  failedAttemptsSince(email: string, since: Date): Promise<Date[]>;
  recordFailedAttempt(email: string, at: Date): Promise<void>;
  clearFailedAttempts(email: string): Promise<void>;
}
