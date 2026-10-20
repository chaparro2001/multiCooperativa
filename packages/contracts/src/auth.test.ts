import { describe, expect, it } from 'vitest';

import { acceptInvitationRequestSchema, loginRequestSchema } from './auth';

describe('authentication contracts', () => {
  it('login requires email and password', () => {
    expect(loginRequestSchema.safeParse({ email: 'ada@field.test' }).success).toBe(false);
    expect(
      loginRequestSchema.parse({ email: ' ada@field.test ', password: 'a-long-password' }),
    ).toEqual({ email: 'ada@field.test', password: 'a-long-password' });
  });

  it('rejects oversized passwords', () => {
    expect(
      loginRequestSchema.safeParse({ email: 'ada@field.test', password: 'x'.repeat(257) }).success,
    ).toBe(false);
  });

  it('the password is optional when accepting an invitation', () => {
    expect(acceptInvitationRequestSchema.parse({ token: 'abc' })).toEqual({ token: 'abc' });
  });
});
