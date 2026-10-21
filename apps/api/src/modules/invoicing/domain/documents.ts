import {
  InvalidDocumentError,
  InvalidInvoiceTransitionError,
  InvalidThirdPartyError,
  InvoicingDomainError,
} from './errors';
import { assertTotal, parseMoney, parseQuantity, parseVatRate } from './money';
import { isValidNif, normalizeNif } from './nif';

export type Operation = 'purchase' | 'sale';

/** A calendar day, YYYY-MM-DD: compared as text, never through time zones. */
export type Day = string;

/** Tags a rule violation raised by `run` with the input field it is about (`details.field`). */
function atField<T>(field: string, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof InvoicingDomainError && !error.field) error.field = field;
    throw error;
  }
}

function assertDay(value: string, what: string, field?: string): Day {
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(date.getTime()) ||
    !date.toISOString().startsWith(value)
  ) {
    throw new InvalidDocumentError(`${what} is not a valid date.`, field);
  }
  return value;
}

export function addDays(day: Day, days: number): Day {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function text(value: string, max: number, what: string, field?: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new InvalidDocumentError(`${what} is missing.`, field);
  if (trimmed.length > max) {
    throw new InvalidDocumentError(`${what} exceeds ${max} characters.`, field);
  }
  return trimmed;
}

// ── Third parties (US-INV-01) ──

export interface ThirdPartyState {
  readonly nif: string;
  readonly name: string;
  readonly isSupplier: boolean;
  readonly isCustomer: boolean;
  readonly email: string | null;
  readonly phone: string | null;
  readonly active: boolean;
}

export interface ThirdPartyInput {
  nif: string;
  name: string;
  isSupplier: boolean;
  isCustomer: boolean;
  email: string | null;
  phone: string | null;
}

function validThirdParty(input: Omit<ThirdPartyInput, 'nif'>) {
  const name = input.name.trim();
  if (!name) throw new InvalidThirdPartyError('The company name is missing.', 'name');
  if (name.length > 200) throw new InvalidThirdPartyError('The company name is too long.', 'name');
  if (!input.isSupplier && !input.isCustomer) {
    throw new InvalidThirdPartyError('Say whether it is a supplier, a customer or both.', 'roles');
  }
  const email = input.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new InvalidThirdPartyError('The email is not valid.', 'email');
  }
  return {
    name,
    isSupplier: input.isSupplier,
    isCustomer: input.isCustomer,
    email,
    phone: input.phone?.trim() || null,
  };
}

export function createThirdParty(input: ThirdPartyInput): ThirdPartyState {
  const nif = normalizeNif(input.nif);
  if (!isValidNif(nif))
    throw new InvalidThirdPartyError(
      'The NIF is not valid: check the letter or the check digit.',
      'nif',
    );
  return { nif, ...validThirdParty(input), active: true };
}

/** The NIF identifies the party in the cooperative (BR-INV-02): it is not edited. */
export function editThirdParty<T extends ThirdPartyState>(
  party: T,
  input: Omit<ThirdPartyInput, 'nif'>,
): T {
  return { ...party, ...validThirdParty(input) };
}

/** BR-INV-14: never deleted; it stops being offered for new records. */
export const deactivate = <T extends ThirdPartyState>(party: T): T => ({ ...party, active: false });
export const reactivate = <T extends ThirdPartyState>(party: T): T => ({ ...party, active: true });

/** BR-INV-03. */
export function assertCanOperate(party: ThirdPartyState, operation: Operation): void {
  if (!party.active)
    throw new InvalidThirdPartyError('The third party is deactivated.', 'thirdPartyId');
  if (operation === 'purchase' && !party.isSupplier) {
    throw new InvalidThirdPartyError(
      'A purchase needs a third party registered as a supplier.',
      'thirdPartyId',
    );
  }
  if (operation === 'sale' && !party.isCustomer) {
    throw new InvalidThirdPartyError(
      'A sale needs a third party registered as a customer.',
      'thirdPartyId',
    );
  }
}

// ── Lines ──

export interface Line {
  readonly concept: string;
  /** Thousandths (BR-INV-13). */
  readonly quantity: bigint;
  readonly unit: string;
}

export interface LineInput {
  concept: string;
  quantity: string;
  unit: string;
}

function validLines(lines: LineInput[]): Line[] {
  return lines.map((line, i) => {
    const quantity = atField(`lines.${i}.quantity`, () => parseQuantity(line.quantity));
    if (quantity <= 0n) {
      throw new InvalidDocumentError(
        `Line ${i + 1}: the quantity must be greater than zero.`,
        `lines.${i}.quantity`,
      );
    }
    return {
      concept: text(line.concept, 200, `The concept of line ${i + 1}`, `lines.${i}.concept`),
      quantity,
      unit: text(line.unit, 20, `The unit of line ${i + 1}`, `lines.${i}.unit`),
    };
  });
}

// ── Delivery notes (US-INV-02) ──

export type DeliveryNoteStatus = 'pending_invoicing' | 'invoiced' | 'voided';

export interface DeliveryNoteState {
  readonly operation: Operation;
  readonly number: string;
  readonly date: Day;
  readonly status: DeliveryNoteStatus;
  readonly lines: readonly Line[];
}

export function createDeliveryNote(input: {
  operation: Operation;
  number: string;
  date: string;
  lines: LineInput[];
}): DeliveryNoteState {
  const lines = validLines(input.lines);
  if (lines.length === 0)
    throw new InvalidDocumentError('The delivery note needs at least one line.', 'lines');
  return {
    operation: input.operation,
    number: text(input.number, 50, 'The delivery note number', 'number'),
    date: assertDay(input.date, 'The delivery note date', 'date'),
    status: 'pending_invoicing',
    lines,
  };
}

export function cancelDeliveryNote<T extends { status: DeliveryNoteStatus }>(note: T): T {
  if (note.status !== 'pending_invoicing') {
    throw new InvalidInvoiceTransitionError(
      'Only a delivery note pending invoicing can be voided.',
    );
  }
  return { ...note, status: 'voided' };
}

// ── Invoices (US-INV-03, US-INV-07) ──

export type PaymentStatus = 'pending' | 'overdue' | 'settled' | 'voided';

export interface InvoiceState {
  readonly operation: Operation;
  readonly number: string;
  readonly issueDate: Day;
  readonly dueDate: Day;
  /** Cents. */
  readonly base: bigint;
  /** Hundredths of a point. */
  readonly vatRate: bigint;
  /** Cents. */
  readonly total: bigint;
  readonly lines: readonly Line[];
  readonly paymentStatus: PaymentStatus;
  readonly settledAt: Day | null;
}

export interface InvoiceInput {
  operation: Operation;
  number: string;
  issueDate: string;
  dueDate: string;
  base: string;
  vatRate: string;
  total: string;
  lines: LineInput[];
}

export function createInvoice(input: InvoiceInput): InvoiceState {
  const issueDate = assertDay(input.issueDate, 'The issue date', 'issueDate');
  const dueDate = assertDay(input.dueDate, 'The due date', 'dueDate');
  if (dueDate < issueDate) {
    throw new InvalidDocumentError(
      'The due date cannot be earlier than the issue date.',
      'dueDate',
    );
  }
  const base = atField('base', () => parseMoney(input.base));
  const vatRate = atField('vatRate', () => parseVatRate(input.vatRate));
  const total = atField('total', () => parseMoney(input.total));
  assertTotal(base, vatRate, total);
  return {
    operation: input.operation,
    number: text(input.number, 50, 'The invoice number', 'number'),
    issueDate,
    dueDate,
    base,
    vatRate,
    total,
    lines: validLines(input.lines),
    paymentStatus: 'pending',
    settledAt: null,
  };
}

/** BR-INV-05 and BR-INV-06: pending notes of the same party and operation. */
export function assertCanGroup(
  invoice: { operation: Operation; thirdPartyId: string; lines: readonly Line[] },
  notes: { thirdPartyId: string; operation: Operation; status: DeliveryNoteStatus }[],
): void {
  if (notes.length === 0) return;
  if (invoice.lines.length === 0) {
    throw new InvalidDocumentError(
      'To reconcile with delivery notes, provide the invoiced lines.',
      'lines',
    );
  }
  for (const note of notes) {
    if (note.thirdPartyId !== invoice.thirdPartyId) {
      throw new InvalidDocumentError(
        'There is a delivery note from another third party.',
        'deliveryNoteIds',
      );
    }
    if (note.operation !== invoice.operation)
      throw new InvalidDocumentError(
        'There is a delivery note of another operation.',
        'deliveryNoteIds',
      );
    if (note.status === 'invoiced')
      throw new InvalidDocumentError(
        'There is an already invoiced delivery note.',
        'deliveryNoteIds',
      );
    if (note.status === 'voided')
      throw new InvalidDocumentError('There is a voided delivery note.', 'deliveryNoteIds');
  }
}

/** BR-INV-09; BR-INV-10: a settled invoice never goes back. */
export function markOverdue<T extends { paymentStatus: PaymentStatus; dueDate: Day }>(
  invoice: T,
  today: Day,
): T {
  return invoice.paymentStatus === 'pending' && invoice.dueDate < today
    ? { ...invoice, paymentStatus: 'overdue' }
    : invoice;
}

export const DUE_SOON_DAYS = 3;

/**
 * US-INV-07: due within the next 3 days. A window rather than an exact day, so
 * a day the daily process does not run loses no notice; the reminder record
 * keeps it from being sent twice (NFR-INV-04).
 */
export function isDueSoon(
  invoice: { paymentStatus: PaymentStatus; dueDate: Day },
  today: Day,
): boolean {
  return (
    invoice.paymentStatus === 'pending' &&
    invoice.dueDate >= today &&
    invoice.dueDate <= addDays(today, DUE_SOON_DAYS)
  );
}

/** Paid (purchase) or collected (sale), with its date. */
export function settle<T extends { paymentStatus: PaymentStatus; settledAt: Day | null }>(
  invoice: T,
  on: string,
): T {
  if (invoice.paymentStatus !== 'pending' && invoice.paymentStatus !== 'overdue') {
    throw new InvalidInvoiceTransitionError('Only a pending or overdue invoice can be settled.');
  }
  return { ...invoice, paymentStatus: 'settled', settledAt: assertDay(on, 'The payment date') };
}

/** “Register the new one and void the old one”: its notes go back to pending. */
export function cancelInvoice<T extends { paymentStatus: PaymentStatus }>(invoice: T): T {
  if (invoice.paymentStatus !== 'pending' && invoice.paymentStatus !== 'overdue') {
    throw new InvalidInvoiceTransitionError('Only a pending or overdue invoice can be voided.');
  }
  return { ...invoice, paymentStatus: 'voided' };
}
