import { describe, expect, it } from 'vitest';

import { InvitationNotUsableError } from './errors';
import { checkInvitation, issueInvitation, useInvitation } from './invitation';

const issuedAt = new Date('2026-10-05T10:00:00Z');
const days = (n: number) => new Date(issuedAt.getTime() + n * 24 * 60 * 60 * 1000);

describe('invitación (RN-ACC-10)', () => {
  it('caduca a los 7 días de emitirse', () => {
    expect(issueInvitation(issuedAt)).toEqual({ expiresAt: days(7), usedAt: null });
  });

  it('es válida antes de caducar', () => {
    expect(checkInvitation(issueInvitation(issuedAt), days(6))).toBe('valid');
  });

  it('está caducada al cumplirse los 7 días', () => {
    expect(checkInvitation(issueInvitation(issuedAt), days(7))).toBe('expired');
  });

  it('es de un solo uso', () => {
    const used = useInvitation(issueInvitation(issuedAt), days(1));

    expect(used.usedAt).toEqual(days(1));
    expect(checkInvitation(used, days(2))).toBe('used');
    expect(() => useInvitation(used, days(2))).toThrow(InvitationNotUsableError);
  });

  it('no se puede usar una invitación caducada (HU-ACC-01)', () => {
    expect(() => useInvitation(issueInvitation(issuedAt), days(8))).toThrow(
      InvitationNotUsableError,
    );
  });
});
