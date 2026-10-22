import { failedAttemptsRetentionCutoff, SESSION_RETENTION_DAYS } from '../domain/login-lockout';
import type { AuthRecordsStore } from './ports/auth-records-store';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface PurgeDeps {
  records: AuthRecordsStore;
  now: () => Date;
}

/**
 * Hourly housekeeping (NFR-ACC-02, BR-ACC-11): drops sessions expired or revoked more than
 * 7 days ago and failed login attempts too old to matter for any lockout. Idempotent.
 */
export async function purgeExpiredAuthRecords(
  deps: PurgeDeps,
): Promise<{ sessions: number; failedAttempts: number }> {
  const now = deps.now();
  const sessionCutoff = new Date(now.getTime() - SESSION_RETENTION_DAYS * DAY_IN_MS);
  const sessions = await deps.records.deleteSessionsEndedBefore(sessionCutoff);
  const failedAttempts = await deps.records.deleteFailedAttemptsBefore(
    failedAttemptsRetentionCutoff(now),
  );
  return { sessions, failedAttempts };
}
