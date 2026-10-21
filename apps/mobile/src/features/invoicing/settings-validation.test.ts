import type { InvoicingSettings } from '@multicooperativa/contracts';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/api-error';
import { messageText } from '@/forms/errors';
import { routeServerError } from '@/forms/server-errors';

import {
  draftFrom,
  INVOICING_SETTINGS_FIELDS,
  type InvoicingSettingsDraft,
  parseDays,
  toSettings,
  validateInvoicingSettings,
} from './settings-validation';

const stored: InvoicingSettings = {
  invoiceNoticeEnabled: true,
  invoiceNoticeDays: 15,
  noteDeadlineEnabled: true,
  noteDeadlineDays: 30,
  noteNoticeEnabled: true,
  noteNoticeDays: 15,
};
const draft = (changes: Partial<InvoicingSettingsDraft> = {}): InvoicingSettingsDraft => ({
  ...draftFrom(stored),
  ...changes,
});

describe('validateInvoicingSettings (BR-INV-15)', () => {
  it('accepts the defaults and the limits of each range', () => {
    expect(validateInvoicingSettings(draft())).toEqual({});
    for (const value of ['1', ' 90 ']) {
      expect(validateInvoicingSettings(draft({ invoiceNoticeDays: value }))).toEqual({});
    }
    expect(
      validateInvoicingSettings(draft({ noteDeadlineDays: '365', noteNoticeDays: '364' })),
    ).toEqual({});
    expect(
      validateInvoicingSettings(draft({ noteDeadlineDays: '2', noteNoticeDays: '1' })),
    ).toEqual({});
  });

  it('asks for the number when empty, only while its alert is on', () => {
    expect(
      validateInvoicingSettings(draft({ invoiceNoticeDays: '  ' })).invoiceNoticeDays?.key,
    ).toBe('forms.errors.required');
    expect(
      validateInvoicingSettings(draft({ invoiceNoticeDays: '', invoiceNoticeEnabled: false })),
    ).toEqual({});
  });

  it('marks values out of range, decimals and text with the allowed range of each field', () => {
    for (const value of ['0', '91', '1.5', '1,5', 'abc', '-3']) {
      const error = validateInvoicingSettings(
        draft({ invoiceNoticeDays: value }),
      ).invoiceNoticeDays;
      expect(error && messageText(error)).toBe('Escribe un número entero entre 1 y 90.');
    }
    for (const value of ['0', '366']) {
      const errors = validateInvoicingSettings(
        draft({ noteDeadlineDays: value, noteNoticeDays: value }),
      );
      expect(messageText(errors.noteDeadlineDays!)).toBe('Escribe un número entero entre 1 y 365.');
      expect(messageText(errors.noteNoticeDays!)).toBe('Escribe un número entero entre 1 y 365.');
    }
  });

  it('the note notice must be shorter than the deadline when both are on', () => {
    for (const notice of ['30', '31']) {
      const errors = validateInvoicingSettings(draft({ noteNoticeDays: notice }));
      expect(Object.keys(errors)).toEqual(['noteNoticeDays']);
      expect(messageText(errors.noteNoticeDays!)).toBe(
        'El aviso debe ser menor que el plazo para facturar (30 días).',
      );
    }
    expect(validateInvoicingSettings(draft({ noteNoticeDays: '29' }))).toEqual({});
  });

  it('that rule is off when the notice or the deadline is switched off', () => {
    expect(
      validateInvoicingSettings(draft({ noteNoticeDays: '50', noteNoticeEnabled: false })),
    ).toEqual({});
    expect(
      validateInvoicingSettings(draft({ noteNoticeDays: '50', noteDeadlineEnabled: false })),
    ).toEqual({});
  });

  it('parses only plain whole numbers', () => {
    expect(parseDays('007')).toBe(7);
    expect(parseDays('7.0')).toBeNull();
  });
});

describe('toSettings', () => {
  it('sends the typed numbers and the switches', () => {
    expect(
      toSettings(
        draft({ invoiceNoticeDays: '7', noteDeadlineEnabled: false, noteNoticeDays: '5' }),
        stored,
      ),
    ).toEqual({
      invoiceNoticeEnabled: true,
      invoiceNoticeDays: 7,
      noteDeadlineEnabled: false,
      noteDeadlineDays: 30,
      noteNoticeEnabled: true,
      noteNoticeDays: 5,
    });
  });

  it('keeps the stored number of a switched-off alert whose text is junk', () => {
    expect(
      toSettings(draft({ invoiceNoticeEnabled: false, invoiceNoticeDays: 'abc' }), stored)
        .invoiceNoticeDays,
    ).toBe(15);
  });
});

describe('API errors on the notice days', () => {
  const fieldNames = (f: string) => (INVOICING_SETTINGS_FIELDS as readonly string[]).includes(f);

  it('puts the invalid_request issue on the field', () => {
    const failure = new ApiError(400, 'invalid_request', '', {
      issues: [{ path: 'noteDeadlineDays', code: 'too_big' }],
    });
    const { fields } = routeServerError(failure, {}, fieldNames);
    expect(Object.keys(fields)).toEqual(['noteDeadlineDays']);
  });

  it('puts the note notice rule on its field, with its own text', () => {
    const failure = new ApiError(400, 'invalid_document', '', { field: 'noteNoticeDays' });
    const { fields } = routeServerError(failure, {}, fieldNames);
    expect(Object.keys(fields)).toEqual(['noteNoticeDays']);
    expect(messageText(fields.noteNoticeDays!)).toBe(
      'El aviso debe ser menor que el plazo para facturar.',
    );
  });
});
