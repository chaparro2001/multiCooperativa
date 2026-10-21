import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/api-error';
import { routeServerError } from '@/forms/server-errors';

import {
  INVITATION_FIELDS,
  INVITATION_SERVER_MAPPING,
  MIN_PASSWORD_LENGTH,
  validateInvitation,
  validateLogin,
} from './form-validation';

describe('validateLogin (US-ACC-02)', () => {
  it('marks both fields when empty', () => {
    const errors = validateLogin({ email: '', password: '' });
    expect(Object.keys(errors).sort()).toEqual(['email', 'password']);
    expect(errors.email?.key).toBe('forms.errors.required');
  });

  it('marks an email without the right shape', () => {
    expect(validateLogin({ email: 'nobody', password: 'x' }).email?.key).toBe('forms.errors.email');
  });

  it('accepts email and password', () => {
    expect(validateLogin({ email: 'ana@sanisidro.test', password: 'secret' })).toEqual({});
  });
});

describe('validateInvitation (US-ACC-01, NFR-ACC-01)', () => {
  it('lets an existing user leave the password empty', () => {
    expect(validateInvitation({ password: '', confirm: '' })).toEqual({});
  });

  it('marks a short password and a confirmation that does not match', () => {
    const errors = validateInvitation({ password: 'short', confirm: 'other' });
    expect(errors.password).toEqual({
      key: 'auth.invitation.errors.passwordTooShort',
      params: { min: MIN_PASSWORD_LENGTH },
    });
    expect(errors.confirm?.key).toBe('auth.invitation.errors.confirmMismatch');
  });

  it('marks the missing confirmation when only a password was typed', () => {
    const errors = validateInvitation({ password: 'a-long-enough-password', confirm: '' });
    expect(Object.keys(errors)).toEqual(['confirm']);
  });

  it('accepts a long enough password repeated', () => {
    expect(
      validateInvitation({ password: 'a-long-enough-password', confirm: 'a-long-enough-password' }),
    ).toEqual({});
  });
});

describe('API errors on the invitation form', () => {
  const route = (error: ApiError) =>
    routeServerError(error, INVITATION_SERVER_MAPPING, (f) =>
      (INVITATION_FIELDS as readonly string[]).includes(f),
    );

  it('puts password_required and weak_password on the password field', () => {
    expect(Object.keys(route(new ApiError(400, 'password_required', '')).fields)).toEqual([
      'password',
    ]);
    expect(Object.keys(route(new ApiError(400, 'weak_password', '')).fields)).toEqual(['password']);
  });

  it('keeps the banner for an expired invitation', () => {
    expect(route(new ApiError(410, 'invitation_not_usable', '')).banner).toBeTruthy();
  });
});
