import {
  INVOICE_NOTICE_DAYS,
  type InvoicingSettings,
  NOTE_DEADLINE_DAYS,
  NOTE_NOTICE_DAYS,
} from '@multicooperativa/contracts';

import { collect, type FieldErrors, type FieldMessage, required } from '@/forms/errors';

/** What the invoicing settings form edits (BR-INV-15): a switch and a number (as typed) per alert. */
export interface InvoicingSettingsDraft {
  invoiceNoticeEnabled: boolean;
  invoiceNoticeDays: string;
  noteDeadlineEnabled: boolean;
  noteDeadlineDays: string;
  noteNoticeEnabled: boolean;
  noteNoticeDays: string;
}

/** The numeric fields the API can flag (`details.field` or the Zod issue path). */
export const INVOICING_SETTINGS_FIELDS = [
  'invoiceNoticeDays',
  'noteDeadlineDays',
  'noteNoticeDays',
] as const;

type DaysField = (typeof INVOICING_SETTINGS_FIELDS)[number];

const RANGES: Record<DaysField, { min: number; max: number }> = {
  invoiceNoticeDays: INVOICE_NOTICE_DAYS,
  noteDeadlineDays: NOTE_DEADLINE_DAYS,
  noteNoticeDays: NOTE_NOTICE_DAYS,
};

const ENABLED: Record<DaysField, keyof InvoicingSettings> = {
  invoiceNoticeDays: 'invoiceNoticeEnabled',
  noteDeadlineDays: 'noteDeadlineEnabled',
  noteNoticeDays: 'noteNoticeEnabled',
};

export function draftFrom(settings: InvoicingSettings): InvoicingSettingsDraft {
  return {
    invoiceNoticeEnabled: settings.invoiceNoticeEnabled,
    invoiceNoticeDays: String(settings.invoiceNoticeDays),
    noteDeadlineEnabled: settings.noteDeadlineEnabled,
    noteDeadlineDays: String(settings.noteDeadlineDays),
    noteNoticeEnabled: settings.noteNoticeEnabled,
    noteNoticeDays: String(settings.noteNoticeDays),
  };
}

/** A whole number as typed ("15"), or null when it is anything else (decimals, letters, empty). */
export function parseDays(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

function inRange(days: number | null, field: DaysField): days is number {
  const { min, max } = RANGES[field];
  return days !== null && days >= min && days <= max;
}

function dayErrors(draft: InvoicingSettingsDraft, field: DaysField): FieldMessage | undefined {
  if (!draft[ENABLED[field] as keyof InvoicingSettingsDraft]) return undefined;
  if (!draft[field].trim()) return required;
  if (inRange(parseDays(draft[field]), field)) return undefined;
  return { key: 'forms.errors.integerBetween', params: RANGES[field] };
}

/**
 * BR-INV-15: each number is a whole number in its range, checked only while its alert is on (a
 * switched-off alert keeps its stored number), and the note notice is shorter than the deadline
 * when both are on. The API checks again and is the authority.
 */
export function validateInvoicingSettings(draft: InvoicingSettingsDraft): FieldErrors {
  const errors = collect({
    invoiceNoticeDays: dayErrors(draft, 'invoiceNoticeDays'),
    noteDeadlineDays: dayErrors(draft, 'noteDeadlineDays'),
    noteNoticeDays: dayErrors(draft, 'noteNoticeDays'),
  });
  const deadline = parseDays(draft.noteDeadlineDays);
  const notice = parseDays(draft.noteNoticeDays);
  if (
    !errors.noteNoticeDays &&
    !errors.noteDeadlineDays &&
    draft.noteDeadlineEnabled &&
    draft.noteNoticeEnabled &&
    deadline !== null &&
    notice !== null &&
    notice >= deadline
  ) {
    errors.noteNoticeDays = {
      key: 'settings.invoicing.errors.noticeNotShorter',
      params: { deadline },
    };
  }
  return errors;
}

/**
 * The body to send: the typed numbers; of a switched-off alert whose text is not a valid number,
 * the stored one, so nothing is lost by leaving junk in a disabled field.
 */
export function toSettings(
  draft: InvoicingSettingsDraft,
  stored: InvoicingSettings,
): InvoicingSettings {
  const days = (field: DaysField): number => {
    const typed = parseDays(draft[field]);
    return inRange(typed, field) ? typed : stored[field];
  };
  return {
    invoiceNoticeEnabled: draft.invoiceNoticeEnabled,
    invoiceNoticeDays: days('invoiceNoticeDays'),
    noteDeadlineEnabled: draft.noteDeadlineEnabled,
    noteDeadlineDays: days('noteDeadlineDays'),
    noteNoticeEnabled: draft.noteNoticeEnabled,
    noteNoticeDays: days('noteNoticeDays'),
  };
}
