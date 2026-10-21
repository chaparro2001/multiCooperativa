import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/api-error';
import { messageText } from '@/forms/errors';
import { routeServerError } from '@/forms/server-errors';

import { emptyDraft, type RegistrationDraft } from './draft';
import {
  isRegistrationField,
  isRegistrationValid,
  REGISTRATION_SERVER_MAPPING,
  validateRegistration,
} from './form-validation';

const PARTY = '40000000-0000-4000-8000-0000000000aa';

function invoice(overrides: Partial<RegistrationDraft> = {}): RegistrationDraft {
  return {
    ...emptyDraft('purchase', 'invoice'),
    thirdPartyId: PARTY,
    number: 'F-1',
    date: '2026-10-05',
    dueDate: '2026-11-05',
    base: '100,00',
    vatRate: '21',
    total: '',
    lines: [],
    ...overrides,
  };
}

describe('validateRegistration (US-INV-02, US-INV-03: fields marked on the form)', () => {
  it('accepts a complete invoice, with the total computed when left empty', () => {
    expect(validateRegistration(invoice())).toEqual({});
    expect(isRegistrationValid(invoice({ total: '121,00' }))).toBe(true);
  });

  it('marks every missing field of an empty invoice', () => {
    const errors = validateRegistration({
      ...emptyDraft('purchase', 'invoice'),
      date: '',
      vatRate: '',
    });
    expect(Object.keys(errors).sort()).toEqual(
      ['base', 'date', 'dueDate', 'number', 'thirdPartyId', 'total', 'vatRate'].sort(),
    );
    expect(errors.number?.key).toBe('forms.errors.required');
  });

  it('marks unreadable amounts and a VAT over 100', () => {
    const errors = validateRegistration(invoice({ base: '12abc', vatRate: '150', total: 'x' }));
    expect(errors.base?.key).toBe('invoicing.form.errors.amount');
    expect(errors.vatRate?.key).toBe('invoicing.form.errors.vat');
    expect(errors.total?.key).toBe('invoicing.form.errors.amount');
  });

  it('marks a due date earlier than the issue date', () => {
    const errors = validateRegistration(invoice({ dueDate: '2026-10-01' }));
    expect(errors.dueDate?.key).toBe('invoicing.form.errors.dueBeforeIssue');
  });

  it('marks a number longer than 50 characters through the contract', () => {
    const errors = validateRegistration(invoice({ number: 'F'.repeat(51) }));
    expect(errors.number).toEqual({ key: 'forms.errors.tooLong', params: { max: 50 } });
  });

  it('marks concept, quantity and unit of each line separately', () => {
    const errors = validateRegistration(
      invoice({
        lines: [
          { concept: 'Oil', quantity: '2', unit: 'kg' },
          { concept: ' ', quantity: '0', unit: '' },
          { concept: 'Salt', quantity: 'abc', unit: 'kg' },
        ],
      }),
    );
    expect(Object.keys(errors).sort()).toEqual(
      ['lines.1.concept', 'lines.1.quantity', 'lines.1.unit', 'lines.2.quantity'].sort(),
    );
    expect(errors['lines.1.quantity']?.key).toBe('forms.errors.mustBePositive');
    expect(errors['lines.2.quantity']?.key).toBe('forms.errors.invalid');
  });

  it('requires lines when delivery notes are grouped (BR-INV-08)', () => {
    const errors = validateRegistration(invoice({ deliveryNoteIds: [PARTY] }));
    expect(errors.lines?.key).toBe('invoicing.form.errors.linesToReconcile');
  });

  it('requires at least one line on a delivery note and ignores invoice-only fields', () => {
    const note = invoice({ kind: 'delivery_note', dueDate: '', base: '', total: '' });
    expect(Object.keys(validateRegistration(note))).toEqual(['lines']);
    const ok = invoice({
      kind: 'delivery_note',
      dueDate: '',
      base: '',
      lines: [{ concept: 'Oil', quantity: '1', unit: 'l' }],
    });
    expect(validateRegistration(ok)).toEqual({});
  });
});

describe('API errors on the registration form (US-INV-03)', () => {
  const route = (error: ApiError) =>
    routeServerError(error, REGISTRATION_SERVER_MAPPING, isRegistrationField);

  it('puts total_mismatch on the total field with the expected amount', () => {
    const { fields, banner } = route(
      new ApiError(400, 'total_mismatch', '', { expected: '121.00', difference: '1.00' }),
    );
    expect(Object.keys(fields)).toEqual(['total']);
    expect(messageText(fields.total!)).toContain('121.00');
    expect(banner).toBeNull();
  });

  it('puts a duplicate number on the number field', () => {
    const { fields } = route(new ApiError(409, 'duplicate_number', ''));
    expect(Object.keys(fields)).toEqual(['number']);
  });

  it('puts the due date rule on the due date and renames issueDate to date', () => {
    expect(
      Object.keys(route(new ApiError(400, 'invalid_document', '', { field: 'dueDate' })).fields),
    ).toEqual(['dueDate']);
    expect(
      Object.keys(route(new ApiError(400, 'invalid_document', '', { field: 'issueDate' })).fields),
    ).toEqual(['date']);
  });

  it('puts a bad line on its row and a deactivated party on the party picker', () => {
    expect(
      Object.keys(
        route(new ApiError(400, 'invalid_amount', '', { field: 'lines.2.quantity' })).fields,
      ),
    ).toEqual(['lines.2.quantity']);
    expect(
      Object.keys(
        route(new ApiError(400, 'invalid_third_party', '', { field: 'thirdPartyId' })).fields,
      ),
    ).toEqual(['thirdPartyId']);
  });

  it('maps the Zod issues of a 400 invalid_request to fields', () => {
    const { fields, banner } = route(
      new ApiError(400, 'invalid_request', '', {
        issues: [
          { path: 'issueDate', code: 'invalid_format' },
          { path: 'lines.0.concept', code: 'too_big' },
        ],
      }),
    );
    expect(Object.keys(fields).sort()).toEqual(['date', 'lines.0.concept']);
    expect(banner).toBeNull();
  });

  it('keeps the banner for errors that belong to no field', () => {
    expect(route(new ApiError(500, 'internal_error', '')).banner).toBeTruthy();
    // A field the form does not render (the attached file) must not vanish.
    const file = route(new ApiError(400, 'invalid_document', '', { field: 'file' }));
    expect(file.fields).toEqual({});
    expect(file.banner).toBeTruthy();
    // An older API without issues still shows the generic banner.
    expect(route(new ApiError(400, 'invalid_request', '')).banner).toBeTruthy();
  });
});
