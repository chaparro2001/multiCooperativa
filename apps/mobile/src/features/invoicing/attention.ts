import type {
  DeliveryNote,
  DeliveryNoteStatus,
  Invoice,
  InvoicingSettings,
  Module,
  PaymentStatus,
} from '@multicooperativa/contracts';

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
 * BR-INV-16 on one invoice: still to pay or collect and overdue or, with the invoice notice on,
 * due within its days. With the notice off only the overdue ones are marked (not even "due
 * today"). Same rule as the server, which decides the counts; this only marks the rows.
 */
export function invoiceAttention(
  invoice: Pick<Invoice, 'paymentStatus' | 'dueDate'>,
  today: string,
  settings: Pick<InvoicingSettings, 'invoiceNoticeEnabled' | 'invoiceNoticeDays'>,
): InvoiceAttention | null {
  const status: PaymentStatus = invoice.paymentStatus;
  if (status !== 'pending' && status !== 'overdue') return null;
  const left = daysBetween(today, invoice.dueDate);
  if (left < 0) return { kind: 'overdue', days: -left };
  if (!settings.invoiceNoticeEnabled || left > settings.invoiceNoticeDays) return null;
  return left === 0 ? { kind: 'dueToday' } : { kind: 'dueSoon', days: left };
}

export interface NoteAttention {
  /** Days since the delivery note date. */
  days: number;
  /** Already past the deadline (red) or reaching it within the notice (amber). */
  stale: boolean;
}

/**
 * BR-INV-16 on one delivery note: pending invoicing and either past the cooperative's deadline
 * or, with the notice on, reaching it within the notice days. With the deadline off there is no
 * such concept: nothing is marked. A stored notice not shorter than the deadline marks every
 * pending note, as the server counts them.
 */
export function noteAttention(
  note: Pick<DeliveryNote, 'status' | 'date'>,
  today: string,
  settings: Pick<
    InvoicingSettings,
    'noteDeadlineEnabled' | 'noteDeadlineDays' | 'noteNoticeEnabled' | 'noteNoticeDays'
  >,
): NoteAttention | null {
  const status: DeliveryNoteStatus = note.status;
  if (status !== 'pending_invoicing' || !settings.noteDeadlineEnabled) return null;
  const age = daysBetween(note.date, today);
  const { noteDeadlineDays: deadline, noteNoticeDays: notice } = settings;
  if (settings.noteNoticeEnabled) {
    if (notice < deadline && age < deadline - notice) return null;
  } else if (age < deadline) {
    return null;
  }
  return { days: Math.max(age, 0), stale: age >= deadline };
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
