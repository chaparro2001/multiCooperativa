/** Steps shown while the model reads a document; the order is the order they are shown in. */
export const READING_STEPS = ['received', 'recognized', 'extracting'] as const;
export type ReadingStep = (typeof READING_STEPS)[number];

export interface ReadingProgress {
  /** 0..90: never reaches 100 because the real end is the server answering. */
  percent: number;
  /** Index in `READING_STEPS` of the step in course; the ones before it are done. */
  current: number;
}

/**
 * Indicative progress for the seconds of waiting while the document is read: an easing curve that
 * slows down towards 90 %, and steps that advance with time. It does not measure anything real.
 */
export function readingProgress(seconds: number): ReadingProgress {
  const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const percent = Math.round(90 * (1 - Math.exp(-elapsed / 8)));
  const current = elapsed < 2 ? 0 : elapsed < 5 ? 1 : 2;
  return { percent, current };
}
