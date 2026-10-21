import { addDays, type Day } from './documents';
import { InvalidDocumentError } from './errors';

/**
 * BR-INV-15: the three alerts of a cooperative, each one with its own switch and its own number
 * of days. A switched-off alert keeps its stored number, so switching it on again restores it.
 */
export interface InvoicingNoticeSettings {
  /** Invoices: warn before the due date. Off: only the overdue ones count. */
  invoiceNoticeEnabled: boolean;
  invoiceNoticeDays: number;
  /** Delivery notes: the term to invoice them, from their date. Off: there is no such concept. */
  noteDeadlineEnabled: boolean;
  noteDeadlineDays: number;
  /** Delivery notes: warn before that term. Off: only the notes already past it count. */
  noteNoticeEnabled: boolean;
  noteNoticeDays: number;
}

export const INVOICE_NOTICE_RANGE = { min: 1, max: 90 } as const;
export const NOTE_DEADLINE_RANGE = { min: 1, max: 365 } as const;
export const NOTE_NOTICE_RANGE = { min: 1, max: 365 } as const;

/** What a cooperative that never chose gets. */
export const DEFAULT_INVOICING_NOTICE_SETTINGS: InvoicingNoticeSettings = {
  invoiceNoticeEnabled: true,
  invoiceNoticeDays: 15,
  noteDeadlineEnabled: true,
  noteDeadlineDays: 30,
  noteNoticeEnabled: true,
  noteNoticeDays: 15,
};

export const INVOICING_NOTICE_FIELDS = Object.keys(
  DEFAULT_INVOICING_NOTICE_SETTINGS,
) as (keyof InvoicingNoticeSettings)[];

function assertDays(
  value: unknown,
  range: { min: number; max: number },
  field: keyof InvoicingNoticeSettings,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < range.min ||
    value > range.max
  ) {
    throw new InvalidDocumentError(
      `${field} must be a whole number between ${range.min} and ${range.max}.`,
      field,
    );
  }
  return value;
}

function assertFlag(value: unknown, field: keyof InvoicingNoticeSettings): boolean {
  if (typeof value !== 'boolean') {
    throw new InvalidDocumentError(`${field} must be true or false.`, field);
  }
  return value;
}

/**
 * BR-INV-15: ranges (1 to 90 days for invoices, 1 to 365 for notes) and, when both note alerts
 * are on, the notice must be shorter than the deadline it announces. With the deadline off the
 * notice is irrelevant, so the rule does not apply (its number is kept).
 */
export function assertInvoicingNoticeSettings(
  input: Record<keyof InvoicingNoticeSettings, unknown>,
): InvoicingNoticeSettings {
  const settings: InvoicingNoticeSettings = {
    invoiceNoticeEnabled: assertFlag(input.invoiceNoticeEnabled, 'invoiceNoticeEnabled'),
    invoiceNoticeDays: assertDays(
      input.invoiceNoticeDays,
      INVOICE_NOTICE_RANGE,
      'invoiceNoticeDays',
    ),
    noteDeadlineEnabled: assertFlag(input.noteDeadlineEnabled, 'noteDeadlineEnabled'),
    noteDeadlineDays: assertDays(input.noteDeadlineDays, NOTE_DEADLINE_RANGE, 'noteDeadlineDays'),
    noteNoticeEnabled: assertFlag(input.noteNoticeEnabled, 'noteNoticeEnabled'),
    noteNoticeDays: assertDays(input.noteNoticeDays, NOTE_NOTICE_RANGE, 'noteNoticeDays'),
  };
  if (
    settings.noteDeadlineEnabled &&
    settings.noteNoticeEnabled &&
    settings.noteNoticeDays >= settings.noteDeadlineDays
  ) {
    throw new InvalidDocumentError(
      'The notice must be shorter than the deadline to invoice a delivery note.',
      'noteNoticeDays',
    );
  }
  return settings;
}

/**
 * BR-INV-16: the last due date that counts. With the notice on it is today plus its days; with it
 * off only the overdue invoices count, that is, those due before today (BR-INV-09).
 */
export function invoiceAttentionUntil(today: Day, settings: InvoicingNoticeSettings): Day {
  return settings.invoiceNoticeEnabled
    ? addDays(today, settings.invoiceNoticeDays)
    : addDays(today, -1);
}

export function invoiceNeedsAttention(
  invoice: { paymentStatus: string; dueDate: Day },
  today: Day,
  settings: InvoicingNoticeSettings,
): boolean {
  return (
    (invoice.paymentStatus === 'pending' || invoice.paymentStatus === 'overdue') &&
    invoice.dueDate <= invoiceAttentionUntil(today, settings)
  );
}

/**
 * US-INV-09, BR-INV-16: the latest note date that counts, `{ upTo }`. A note is past its deadline
 * when it is `noteDeadlineDays` old; with the notice on it also counts that many days before
 * (`date <= today - (deadline - notice)`). A notice not shorter than the deadline (stored before
 * the rule existed) counts every pending note: `upTo` is null. With the deadline off there is no
 * concept at all: the result is null.
 */
export function noteAttentionUpTo(
  today: Day,
  settings: InvoicingNoticeSettings,
): { upTo: Day | null } | null {
  if (!settings.noteDeadlineEnabled) return null;
  if (!settings.noteNoticeEnabled) return { upTo: addDays(today, -settings.noteDeadlineDays) };
  return settings.noteNoticeDays >= settings.noteDeadlineDays
    ? { upTo: null }
    : { upTo: addDays(today, settings.noteNoticeDays - settings.noteDeadlineDays) };
}

/** Notes already past the deadline (the "stale" ones), none with the deadline off. */
export function noteDeadlineCutoff(today: Day, settings: InvoicingNoticeSettings): Day | null {
  return settings.noteDeadlineEnabled ? addDays(today, -settings.noteDeadlineDays) : null;
}

export function noteNeedsAttention(
  note: { status: string; date: Day },
  today: Day,
  settings: InvoicingNoticeSettings,
): boolean {
  if (note.status !== 'pending_invoicing') return false;
  const window = noteAttentionUpTo(today, settings);
  return window !== null && (window.upTo === null || note.date <= window.upTo);
}
