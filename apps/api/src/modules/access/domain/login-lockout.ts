export const MAX_FAILED_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MINUTES = 15;
export const LOCKOUT_MINUTES = 15;

const MINUTE_IN_MS = 60 * 1000;

/**
 * RN-ACC-11: five failed attempts within 15 minutes lock the login for
 * 15 minutes, counted from the fifth failure. Returns when the lock ends,
 * or null if the login is not locked at `now`.
 */
export function lockedUntil(failedAttempts: readonly Date[], now: Date): Date | null {
  const times = failedAttempts.map((attempt) => attempt.getTime()).sort((a, b) => a - b);

  for (let last = times.length - 1; last >= MAX_FAILED_ATTEMPTS - 1; last--) {
    const lastTime = times[last]!;
    const firstTime = times[last - (MAX_FAILED_ATTEMPTS - 1)]!;
    const until = lastTime + LOCKOUT_MINUTES * MINUTE_IN_MS;

    if (lastTime - firstTime <= ATTEMPT_WINDOW_MINUTES * MINUTE_IN_MS && now.getTime() < until) {
      return new Date(until);
    }
  }
  return null;
}
