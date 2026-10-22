/** Share of `value` in `total` as 0..1; 0 when there is nothing to count. */
export function ratio(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, Math.max(0, value / total));
}

/** Whole percentage for the written label ("42 de 120 (35 %)"). */
export function percent(value: number, total: number): number {
  return Math.round(ratio(value, total) * 100);
}

/** A threshold mark (0..1) clamped to the bar, or null when there is none. */
export function clampMark(mark: number | null | undefined): number | null {
  if (mark === null || mark === undefined || !Number.isFinite(mark)) return null;
  return Math.min(1, Math.max(0, mark));
}

export type TallyKey = 'favor' | 'against' | 'abstentions';

/** Bar shares of a vote tally, relative to the votes counted (all zero while nobody voted). */
export function tallyShares(
  counts: Record<TallyKey, number>,
): { key: TallyKey; count: number; share: number }[] {
  const total = counts.favor + counts.against + counts.abstentions;
  return (['favor', 'against', 'abstentions'] as const).map((key) => ({
    key,
    count: counts[key],
    share: ratio(counts[key], total),
  }));
}
