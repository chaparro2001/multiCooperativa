import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/api-error';
import { messageText } from '@/forms/errors';
import { routeServerError } from '@/forms/server-errors';

import {
  INVITE_FIELDS,
  INVITE_SERVER_MAPPING,
  type InviteDraft,
  validateInvite,
} from './form-validation';

const PROFILE = '40000000-0000-4000-8000-0000000000aa';

const draft = (overrides: Partial<InviteDraft> = {}): InviteDraft => ({
  email: 'new@member.test',
  name: 'New Member',
  profileId: PROFILE,
  isPartner: true,
  partnerNumber: '',
  ...overrides,
});

describe('validateInvite (US-ACC-08)', () => {
  it('accepts a complete invitation; the partner number is optional', () => {
    expect(validateInvite(draft())).toEqual({});
    expect(validateInvite(draft({ isPartner: false, partnerNumber: 'ignored' }))).toEqual({});
  });

  it('marks every missing field', () => {
    const errors = validateInvite(draft({ email: '', name: ' ', profileId: null }));
    expect(Object.keys(errors).sort()).toEqual(['email', 'name', 'profileId']);
    expect(errors.profileId?.key).toBe('members.invite.errors.profileRequired');
  });

  it('marks a bad email, a long name and a long partner number', () => {
    const errors = validateInvite(
      draft({ email: 'bad@', name: 'N'.repeat(201), partnerNumber: '9'.repeat(51) }),
    );
    expect(errors.email?.key).toBe('forms.errors.email');
    expect(errors.name?.key).toBe('forms.errors.tooLong');
    expect(errors.partnerNumber?.key).toBe('forms.errors.tooLong');
  });
});

describe('API errors on the invitation form (US-ACC-08)', () => {
  const route = (error: ApiError) =>
    routeServerError(error, INVITE_SERVER_MAPPING, (f) =>
      (INVITE_FIELDS as readonly string[]).includes(f),
    );

  it('puts an email that already belongs to a member on the email field', () => {
    const { fields, banner } = route(new ApiError(409, 'member_already_exists', ''));
    expect(Object.keys(fields)).toEqual(['email']);
    expect(messageText(fields.email!)).toMatch(/miembro/);
    expect(banner).toBeNull();
  });

  it('puts an unknown profile on the profile picker', () => {
    expect(Object.keys(route(new ApiError(400, 'profile_not_found', '')).fields)).toEqual([
      'profileId',
    ]);
  });

  it('maps the Zod issues of invalid_request', () => {
    const { fields } = route(
      new ApiError(400, 'invalid_request', '', {
        issues: [{ path: 'email', code: 'invalid_format' }],
      }),
    );
    expect(Object.keys(fields)).toEqual(['email']);
  });
});
