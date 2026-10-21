/** Largest number a home badge shows; above it, "99+". */
export const BADGE_CAP = 99;

/** The text of a home badge, or null when there is nothing to show (zero or less). */
export function badgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > BADGE_CAP ? `${BADGE_CAP}+` : String(Math.trunc(count));
}
