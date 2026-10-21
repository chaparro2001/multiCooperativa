import { type FieldErrors, required } from '@/forms/errors';

import { DUE_SOON_DAYS_MAX, DUE_SOON_DAYS_MIN } from './attention';

/** What the invoicing settings form edits (BR-INV-15). */
export interface InvoicingSettingsDraft {
  dueSoonDays: string;
}

export const INVOICING_SETTINGS_FIELDS = ['dueSoonDays'] as const;

/** A whole number as typed ("15"), or null when it is anything else (decimals, letters, empty). */
export function parseDays(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** BR-INV-15: a whole number from 1 to 90; the API checks again and is the authority. */
export function validateInvoicingSettings(draft: InvoicingSettingsDraft): FieldErrors {
  if (!draft.dueSoonDays.trim()) return { dueSoonDays: required };
  const days = parseDays(draft.dueSoonDays);
  if (days === null || days < DUE_SOON_DAYS_MIN || days > DUE_SOON_DAYS_MAX) {
    return {
      dueSoonDays: {
        key: 'forms.errors.integerBetween',
        params: { min: DUE_SOON_DAYS_MIN, max: DUE_SOON_DAYS_MAX },
      },
    };
  }
  return {};
}
