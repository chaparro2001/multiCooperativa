import type { CapitalMovementType, MemberCapital } from '@multicooperativa/contracts';

import { normalizeAmountInput } from '@/features/invoicing/amounts';

/** BR-MEM-02, in the order of the form. */
export const MOVEMENT_TYPES: readonly CapitalMovementType[] = [
  'mandatory_contribution',
  'voluntary_contribution',
  'refund',
  'correction',
];

/**
 * BR-MEM-03: what a movement does to the capital, as a signed decimal string. A refund is stored
 * positive but takes capital out; a correction keeps its own sign. Exact: no floating point (BR-MEM-04).
 */
export function capitalChange(type: CapitalMovementType, amount: string): string {
  if (type !== 'refund') return amount;
  return amount.startsWith('-') ? amount.slice(1) : `-${amount}`;
}

/** Colour of an amount in a statement: money in, money out. */
export function changeTone(change: string): 'info' | 'danger' | 'neutral' {
  if (/^-?0+(\.0+)?$/.test(change)) return 'neutral';
  return change.startsWith('-') ? 'danger' : 'info';
}

const plain = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

/** US-MEM-04: partners by name, email or partner number, without accents. The server's order is kept. */
export function filterPartners(items: readonly MemberCapital[], search: string): MemberCapital[] {
  const wanted = plain(search.trim());
  if (!wanted) return [...items];
  return items.filter(({ member }) =>
    [member.name, member.email, member.partnerNumber ?? ''].some((field) =>
      plain(field).includes(wanted),
    ),
  );
}

export interface MovementDraft {
  type: CapitalMovementType;
  /** YYYY-MM-DD. */
  date: string;
  concept: string;
  /** As typed: "1.250,50", "600", "-0,50". */
  amount: string;
}

export type MovementDraftError = 'concept_missing' | 'amount_invalid' | 'amount_not_positive';

/** US-MEM-03: validates the form like the server will, so the user is told before the round trip. */
export function movementRequest(
  draft: MovementDraft,
):
  | {
      ok: true;
      request: { date: string; type: CapitalMovementType; concept: string; amount: string };
    }
  | { ok: false; error: MovementDraftError } {
  const concept = draft.concept.trim();
  if (!concept) return { ok: false, error: 'concept_missing' };
  const amount = normalizeAmountInput(draft.amount);
  if (amount === null) return { ok: false, error: 'amount_invalid' };
  const zero = /^-?0+\.00$/.test(amount);
  if (zero) return { ok: false, error: 'amount_not_positive' };
  // Only a correction carries its own sign; the others are positive.
  if (draft.type !== 'correction' && amount.startsWith('-')) {
    return { ok: false, error: 'amount_not_positive' };
  }
  return { ok: true, request: { date: draft.date, type: draft.type, concept, amount } };
}
