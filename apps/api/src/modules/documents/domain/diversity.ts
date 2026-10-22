/** Fragments of one document that may take the top places of a result (ADR-023). */
export const MAX_PER_DOCUMENT = 2;

/**
 * Per-document diversity: keeps the ranking order, but lets each document take at most
 * `perDocument` places, so a second or third document with an answer is not pushed out by one
 * long document. The limit is soft: when there are not enough other documents to fill `limit`,
 * the fragments that were held back fill the rest, after the others, in their original order, so a single relevant
 * document still gets all the context it has.
 */
export function diversify<T extends { documentId: string }>(
  ranked: readonly T[],
  limit: number,
  perDocument = MAX_PER_DOCUMENT,
): T[] {
  const perDoc = new Map<string, number>();
  const kept: T[] = [];
  const heldBack: T[] = [];
  for (const item of ranked) {
    const count = perDoc.get(item.documentId) ?? 0;
    if (count < perDocument) {
      perDoc.set(item.documentId, count + 1);
      kept.push(item);
    } else {
      heldBack.push(item);
    }
  }
  return [...kept.slice(0, limit), ...heldBack.slice(0, Math.max(0, limit - kept.length))];
}
