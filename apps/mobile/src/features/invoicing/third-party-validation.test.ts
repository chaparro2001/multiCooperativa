import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/api-error';
import { messageText } from '@/forms/errors';
import { routeServerError } from '@/forms/server-errors';

import {
  THIRD_PARTY_FIELDS,
  THIRD_PARTY_SERVER_MAPPING,
  type ThirdPartyDraft,
  validateThirdParty,
} from './third-party-validation';

const draft = (overrides: Partial<ThirdPartyDraft> = {}): ThirdPartyDraft => ({
  nif: 'B12345674',
  name: 'Southern Fertilizers SL',
  isSupplier: true,
  isCustomer: false,
  email: '',
  phone: '',
  ...overrides,
});

describe('validateThirdParty (US-INV-01)', () => {
  it('accepts a complete record with optional email and phone empty', () => {
    expect(validateThirdParty(draft(), true)).toEqual({});
    expect(validateThirdParty(draft({ email: 'a@b.es', phone: '+34 600 111 222' }), true)).toEqual(
      {},
    );
  });

  it('marks the missing NIF, name and role', () => {
    const errors = validateThirdParty(
      draft({ nif: ' ', name: '', isSupplier: false, isCustomer: false }),
      true,
    );
    expect(Object.keys(errors).sort()).toEqual(['name', 'nif', 'roles']);
    expect(errors.roles?.key).toBe('invoicing.thirdParties.errors.roles');
  });

  it('does not ask for the NIF when editing: it cannot be changed', () => {
    expect(validateThirdParty(draft({ nif: '' }), false)).toEqual({});
  });

  it('marks an email without the right shape and a phone with letters', () => {
    const errors = validateThirdParty(draft({ email: 'not-an-email', phone: 'call me' }), true);
    expect(errors.email?.key).toBe('forms.errors.email');
    expect(errors.phone?.key).toBe('forms.errors.phone');
  });

  it('marks values over the contract limits', () => {
    const errors = validateThirdParty(draft({ nif: 'X'.repeat(21), name: 'N'.repeat(201) }), true);
    expect(errors.nif?.key).toBe('forms.errors.tooLong');
    expect(errors.name?.key).toBe('forms.errors.tooLong');
  });
});

describe('API errors on the third party form (NFR-INV-06)', () => {
  const isKnown = (name: string) => (THIRD_PARTY_FIELDS as readonly string[]).includes(name);
  const route = (error: ApiError) => routeServerError(error, THIRD_PARTY_SERVER_MAPPING, isKnown);

  it('puts an invalid NIF on the NIF field', () => {
    const { fields, banner } = route(
      new ApiError(400, 'invalid_third_party', '', { field: 'nif' }),
    );
    expect(Object.keys(fields)).toEqual(['nif']);
    expect(messageText(fields.nif!)).toMatch(/NIF/);
    expect(banner).toBeNull();
  });

  it('puts a duplicate NIF on the NIF field', () => {
    const { fields } = route(new ApiError(409, 'third_party_exists', '', { thirdPartyId: 'x' }));
    expect(Object.keys(fields)).toEqual(['nif']);
  });

  it('puts the roles and email rules on their fields', () => {
    expect(
      Object.keys(route(new ApiError(400, 'invalid_third_party', '', { field: 'roles' })).fields),
    ).toEqual(['roles']);
    expect(
      Object.keys(route(new ApiError(400, 'invalid_third_party', '', { field: 'email' })).fields),
    ).toEqual(['email']);
  });
});
