import { describe, expect, it } from 'vitest';

import { InvitationNotUsableError } from './errors';
import { checkInvitation, issueInvitation, useInvitation } from './invitation';

const issuedAt = new Date('2026-10-05T10:00:00Z');
const days = (n: number) => new Date(issuedAt.getTime() + n * 24 * 60 * 60 * 1000);

describe('invitation (BR-ACC-10)', () => {
  it('expires 7 days after being issued', () => {
    expect(issueInvitation(issuedAt)).toEqual({ expiresAt: days(7), usedAt: null });
  });

  it('is valid before expiring', () => {
    expect(checkInvitation(issueInvitation(issuedAt), days(6))).toBe('valid');
  });

  it('is expired once the 7 days are over', () => {
    expect(checkInvitation(issueInvitation(issuedAt), days(7))).toBe('expired');
  });

  it('is single use', () => {
    const used = useInvitation(issueInvitation(issuedAt), days(1));

    expect(used.usedAt).toEqual(days(1));
    expect(checkInvitation(used, days(2))).toBe('used');
    expect(() => useInvitation(used, days(2))).toThrow(InvitationNotUsableError);
  });

  it('an expired invitation cannot be used (US-ACC-01)', () => {
    expect(() => useInvitation(issueInvitation(issuedAt), days(8))).toThrow(
      InvitationNotUsableError,
    );
  });
});
