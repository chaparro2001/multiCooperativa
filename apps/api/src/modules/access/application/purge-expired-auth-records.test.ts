import { describe, expect, it } from 'vitest';

import type { AuthRecordsStore } from './ports/auth-records-store';
import { purgeExpiredAuthRecords } from './purge-expired-auth-records';

const NOW = new Date('2026-10-22T12:00:00Z');

function fakeStore() {
  const calls = { sessions: [] as Date[], attempts: [] as Date[] };
  const records: AuthRecordsStore = {
    deleteSessionsEndedBefore: async (before) => (calls.sessions.push(before), 3),
    deleteFailedAttemptsBefore: async (before) => (calls.attempts.push(before), 5),
  };
  return { records, calls };
}

describe('purgeExpiredAuthRecords', () => {
  it('NFR-ACC-02 deletes sessions ended more than 7 days ago', async () => {
    const { records, calls } = fakeStore();

    const result = await purgeExpiredAuthRecords({ records, now: () => NOW });

    expect(calls.sessions).toEqual([new Date('2026-10-15T12:00:00Z')]);
    expect(result.sessions).toBe(3);
  });

  it('BR-ACC-11 deletes failed attempts older than twice the lockout span (1 hour)', async () => {
    const { records, calls } = fakeStore();

    const result = await purgeExpiredAuthRecords({ records, now: () => NOW });

    expect(calls.attempts).toEqual([new Date('2026-10-22T11:00:00Z')]);
    expect(result.failedAttempts).toBe(5);
  });
});
