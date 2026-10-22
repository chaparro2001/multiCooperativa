/** Housekeeping of authentication records (platform-level, not tied to a cooperative). */
export interface AuthRecordsStore {
  /** Deletes sessions whose expiry or revocation is before `before`; returns how many. */
  deleteSessionsEndedBefore(before: Date): Promise<number>;
  /** Deletes failed login attempts that happened before `before`; returns how many. */
  deleteFailedAttemptsBefore(before: Date): Promise<number>;
}
