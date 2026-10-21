import { describe, expect, it } from 'vitest';

import {
  inviteMemberResponseSchema,
  inviteMemberRequestSchema,
  resendInvitationResponseSchema,
  updateMemberRequestSchema,
} from './access';

const profileId = '10000000-0000-4000-8000-000000000001';

describe('member contracts', () => {
  it('the invitation requires a valid email', () => {
    const base = { name: 'Grace', profileId, isPartner: true };

    expect(inviteMemberRequestSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(
      false,
    );
    expect(inviteMemberRequestSchema.parse({ ...base, email: ' grace@field.test ' }).email).toBe(
      'grace@field.test',
    );
  });

  it('a member change is either profile or status, not both nor anything else', () => {
    expect(updateMemberRequestSchema.safeParse({ profileId }).success).toBe(true);
    expect(updateMemberRequestSchema.safeParse({ status: 'suspended' }).success).toBe(true);
    expect(updateMemberRequestSchema.safeParse({ status: 'removed' }).success).toBe(false);
    expect(updateMemberRequestSchema.safeParse({ profileId, status: 'suspended' }).success).toBe(
      false,
    );
    expect(updateMemberRequestSchema.safeParse({}).success).toBe(false);
  });

  it('ADR-016: the invitation response carries the expiry and, optionally, the activation link', () => {
    const expiresAt = '2026-10-28T10:00:00.000Z';
    const membershipId = crypto.randomUUID();
    const invitationUrl = 'https://coop.example/multiCooperativa/invitation?token=abc';

    expect(inviteMemberResponseSchema.safeParse({ membershipId, expiresAt }).success).toBe(true);
    expect(
      inviteMemberResponseSchema.parse({ membershipId, expiresAt, invitationUrl }).invitationUrl,
    ).toBe(invitationUrl);
    expect(resendInvitationResponseSchema.safeParse({ expiresAt, invitationUrl }).success).toBe(
      true,
    );
    expect(resendInvitationResponseSchema.safeParse({ invitationUrl: 'nope' }).success).toBe(false);
  });
});
