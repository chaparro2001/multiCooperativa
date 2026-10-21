import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/api-error';
import { messageText } from '@/forms/errors';
import { routeServerError } from '@/forms/server-errors';

import {
  INVOICING_SETTINGS_FIELDS,
  parseDays,
  validateInvoicingSettings,
} from './settings-validation';

describe('validateInvoicingSettings (BR-INV-15)', () => {
  it('accepts whole numbers from 1 to 90', () => {
    for (const value of ['1', '15', ' 90 ']) {
      expect(validateInvoicingSettings({ dueSoonDays: value })).toEqual({});
    }
  });

  it('asks for the number when empty', () => {
    expect(validateInvoicingSettings({ dueSoonDays: '  ' }).dueSoonDays?.key).toBe(
      'forms.errors.required',
    );
  });

  it('marks values out of range, decimals and text with the allowed range', () => {
    for (const value of ['0', '91', '1.5', '1,5', 'abc', '-3']) {
      const error = validateInvoicingSettings({ dueSoonDays: value }).dueSoonDays;
      expect(error && messageText(error)).toBe('Escribe un número entero entre 1 y 90.');
    }
  });

  it('parses only plain whole numbers', () => {
    expect(parseDays('007')).toBe(7);
    expect(parseDays('7.0')).toBeNull();
  });
});

describe('API errors on the notice days', () => {
  it('puts the invalid_request issue on the field', () => {
    const failure = new ApiError(400, 'invalid_request', '', {
      issues: [{ path: 'dueSoonDays', code: 'too_big' }],
    });
    const { fields } = routeServerError(failure, {}, (f) =>
      (INVOICING_SETTINGS_FIELDS as readonly string[]).includes(f),
    );
    expect(Object.keys(fields)).toEqual(['dueSoonDays']);
  });
});
