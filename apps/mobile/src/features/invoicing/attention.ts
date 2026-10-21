import type {
  DeliveryNote,
  Invoice,
  Module,
  PaymentStatus,
  DeliveryNoteStatus,
} from '@multicooperativa/contracts';

/** US-INV-09: pending delivery notes older than this many days are stale (same as the server). */
export const STALE_NOTE_DAYS = 30;

/** BR-INV-15: bounds of the notice days a cooperative can choose. */
export const DUE_SOON_DAYS_MIN = 1;
export const DUE_SOON_DAYS_MAX = 90;

/** Calendar day in Spain (YYYY-MM-DD), where the cooperatives are; the server counts with the same day. */
export function todayInSpain(now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now);
  } catch {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
}

const MS_PER_DAY = 86_400_000;

/** Whole days from `from` to `to` (negative when `to` is earlier); calendar days, no time zones. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

export type InvoiceAttention =
  { kind: 'overdue'; days: number } | { kind: 'dueToday' } | { kind: 'dueSoon'; days: number };

/**
 * BR-INV-16 on one invoice: still to pay or collect and overdue or due within `days` days.
 * Same rule as the server, which decides the counts; this only marks the rows of the list.
 */
export function invoiceAttention(
  invoice: Pick<Invoice, 'paymentStatus' | 'dueDate'>,
  today: string,
  days: number,
): InvoiceAttention | null {
  const status: PaymentStatus = invoice.paymentStatus;
  if (status !== 'pending' && status !== 'overdue') return null;
  const left = daysBetween(today, invoice.dueDate);
  if (left < 0) return { kind: 'overdue', days: -left };
  if (left > days) return null;
  return left === 0 ? { kind: 'dueToday' } : { kind: 'dueSoon', days: left };
}

export interface NoteAttention {
  /** Days since the delivery note date. */
  days: number;
  /** Already past the 30 days (red) or reaching them within the notice window (amber). */
  stale: boolean;
}

/**
 * BR-INV-16 on one delivery note: pending invoicing and either older than 30 days or reaching
 * them within `days` days; with `days` of 30 or more every pending note counts.
 */
export function noteAttention(
  note: Pick<DeliveryNote, 'status' | 'date'>,
  today: string,
  days: number,
): NoteAttention | null {
  const status: DeliveryNoteStatus = note.status;
  if (status !== 'pending_invoicing') return null;
  const age = daysBetween(note.date, today);
  if (days < STALE_NOTE_DAYS && age < STALE_NOTE_DAYS - days) return null;
  return { days: Math.max(age, 0), stale: age >= STALE_NOTE_DAYS };
}

/**
 * Same rule as the API (BR-INV-15): the section of Settings is shown to whoever administers the
 * cooperative, the users module at "manage" level. It only hides; the API answers 403 otherwise.
 */
export function canEditInvoicingSettings(
  permissions: readonly { module: Module; level: string }[] | undefined,
): boolean {
  return permissions?.some((p) => p.module === 'users' && p.level === 'manage') ?? false;
}
