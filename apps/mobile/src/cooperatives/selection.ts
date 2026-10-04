/**
 * HU-ACC-05: which cooperative to open after logging in, or null to show the
 * selector. The last one used wins while it is still active; with a single
 * active membership there is nothing to choose.
 */
export function initialCooperative(
  activeCooperativeIds: readonly string[],
  lastUsed: string | null,
): string | null {
  if (lastUsed && activeCooperativeIds.includes(lastUsed)) return lastUsed;
  if (activeCooperativeIds.length === 1) return activeCooperativeIds[0]!;
  return null;
}
