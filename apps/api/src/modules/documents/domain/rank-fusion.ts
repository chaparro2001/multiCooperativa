/** Reciprocal Rank Fusion constant (Cormack et al., 2009); 60 is the value the literature settled on. */
export const RRF_K = 60;

/** One candidate with its 1-based rank in each arm; `null` when the arm did not return it. */
export interface RankedCandidate {
  vectorRank: number | null;
  textRank: number | null;
}

/**
 * Reciprocal Rank Fusion: the sum over the arms of 1 / (k + rank). It only uses ranks, so the
 * cosine similarity and ts_rank_cd scales (which are not comparable) never have to be mixed.
 */
export function reciprocalRankFusion(candidate: RankedCandidate, k = RRF_K): number {
  return [candidate.vectorRank, candidate.textRank].reduce<number>(
    (sum, rank) => (rank === null ? sum : sum + 1 / (k + rank)),
    0,
  );
}

/**
 * Orders candidates by fused score (best first) and keeps `limit`. Ties keep the input order,
 * so the result is deterministic.
 */
export function fuseRankings<T extends RankedCandidate>(candidates: T[], limit: number): T[] {
  return candidates
    .map((candidate, order) => ({ candidate, order, fused: reciprocalRankFusion(candidate) }))
    .sort((a, b) => b.fused - a.fused || a.order - b.order)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}
