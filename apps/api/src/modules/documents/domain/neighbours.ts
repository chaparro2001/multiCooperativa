/** Longest text handed to the model for one result: the fragment and its neighbours (ADR-023). */
export const MAX_CONTEXT_CHARS = 1600;
/** A fragment shorter than this is thin on its own. */
export const SHORT_FRAGMENT = 400;

export interface NeighbourText {
  page: number;
  content: string;
}

const ENDS_SENTENCE = /[.!?…;:)"»]\s*$/;
const STARTS_MID_SENTENCE = /^[a-záéíóúñü]/;

/** Fragments overlap when a long unit was split: drop the repeated head of `next`. */
function withoutOverlap(current: string, next: string): string {
  const max = Math.min(current.length, next.length, 200);
  for (let size = max; size >= 20; size--) {
    if (current.endsWith(next.slice(0, size))) return next.slice(size).trimStart();
  }
  return next;
}

/**
 * Context for the model: the fragment plus, when it is short or cut mid-sentence, the adjacent
 * fragment of the same page that continues it (after) or that it continues (before), never more
 * than `max` characters in total. The citation keeps the page of the fragment itself; neighbours
 * on another page are not used. A fragment that stands alone comes back unchanged.
 */
export function expandContext(
  hit: { page: number; content: string },
  neighbours: { previous?: NeighbourText; next?: NeighbourText },
  max = MAX_CONTEXT_CHARS,
): string {
  let text = hit.content;
  const thin = text.length < SHORT_FRAGMENT;

  const next = neighbours.next?.page === hit.page ? neighbours.next : undefined;
  if (next && (thin || !ENDS_SENTENCE.test(text))) {
    const addition = withoutOverlap(text, next.content);
    if (text.length + 2 + addition.length <= max) text = `${text}\n\n${addition}`;
  }

  const previous = neighbours.previous?.page === hit.page ? neighbours.previous : undefined;
  if (previous && (thin || STARTS_MID_SENTENCE.test(hit.content))) {
    // The fragment may start with the tail of the previous one (overlap): do not repeat it.
    const addition = previous.content;
    const body = withoutOverlap(addition, text);
    if (addition.length + 2 + body.length <= max) text = `${addition}\n\n${body}`;
  }
  return text;
}
