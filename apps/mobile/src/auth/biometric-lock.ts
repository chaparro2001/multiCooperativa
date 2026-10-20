/** Back from the background after this long, the app asks for biometrics again. */
export const RELOCK_AFTER_MS = 60_000;

/**
 * US-ACC-04. Locks on a cold start with a session, and when the app returns
 * after a while in the background; a quick switch to another app does not.
 */
export function shouldLock(input: {
  enabled: boolean;
  hasSession: boolean;
  backgroundedAt: number | null;
  now: number;
  coldStart: boolean;
}): boolean {
  if (!input.enabled || !input.hasSession) return false;
  if (input.coldStart) return true;
  return input.backgroundedAt !== null && input.now - input.backgroundedAt >= RELOCK_AFTER_MS;
}
