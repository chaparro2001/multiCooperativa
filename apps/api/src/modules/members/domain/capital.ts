import { InsufficientCapitalError, InvalidMovementError } from './errors';
import { formatMoney, parseMoney } from './money';

/** BR-MEM-02. */
export const MOVEMENT_TYPES = [
  'mandatory_contribution',
  'voluntary_contribution',
  'refund',
  'correction',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MAX_CONCEPT_LENGTH = 200;
/** Fits the Decimal(12, 2) column. */
const MAX_AMOUNT_CENTS = 999_999_999_999n;

/** What a movement is stored as: refunds and contributions positive, corrections signed. */
export interface Movement {
  readonly date: string;
  readonly type: MovementType;
  readonly concept: string;
  readonly amountCents: bigint;
}

export interface NewMovementInput {
  /** YYYY-MM-DD. */
  readonly date: string;
  readonly type: MovementType;
  readonly concept: string;
  /** Decimal string; positive, except for a correction, which carries its own sign. */
  readonly amount: string;
}

/** BR-MEM-03: contributions add, refunds subtract, corrections keep their sign. */
export function effectOf(type: MovementType, amountCents: bigint): bigint {
  return type === 'refund' ? -amountCents : amountCents;
}

/** BR-MEM-03: contributions - refunds +- corrections. */
export function balanceOf(movements: readonly Pick<Movement, 'type' | 'amountCents'>[]): bigint {
  return movements.reduce((sum, { type, amountCents }) => sum + effectOf(type, amountCents), 0n);
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * US-MEM-03: validates a new movement against the capital the member has now.
 * BR-MEM-01: the result is frozen; the only way to change history is a new movement.
 */
export function createMovement(input: NewMovementInput, currentBalanceCents: bigint): Movement {
  if (!isRealDate(input.date)) throw new InvalidMovementError('The date must be YYYY-MM-DD.');
  if (!(MOVEMENT_TYPES as readonly string[]).includes(input.type)) {
    throw new InvalidMovementError('Unknown movement type.');
  }
  const concept = input.concept.trim();
  if (concept.length === 0 || concept.length > MAX_CONCEPT_LENGTH) {
    throw new InvalidMovementError(`The concept needs 1 to ${MAX_CONCEPT_LENGTH} characters.`);
  }
  const amountCents = parseMoney(input.amount);
  const magnitude = amountCents < 0n ? -amountCents : amountCents;
  if (magnitude > MAX_AMOUNT_CENTS) throw new InvalidMovementError('The amount is too large.');
  if (input.type === 'correction') {
    if (amountCents === 0n) throw new InvalidMovementError('A correction cannot be zero.');
  } else if (amountCents <= 0n) {
    throw new InvalidMovementError('The amount must be positive.');
  }
  if (currentBalanceCents + effectOf(input.type, amountCents) < 0n) {
    throw new InsufficientCapitalError(formatMoney(currentBalanceCents));
  }
  return Object.freeze({ date: input.date, type: input.type, concept, amountCents });
}
