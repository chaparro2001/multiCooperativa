import { describe, expect, it } from 'vitest';

import { lockedUntil, relevantAttemptsSince } from './login-lockout';

const start = new Date('2026-10-05T10:00:00Z');
const minutes = (n: number) => new Date(start.getTime() + n * 60 * 1000);

describe('attempt lockout (BR-ACC-11)', () => {
  it('without failed attempts there is no lockout', () => {
    expect(lockedUntil([], minutes(0))).toBeNull();
  });

  it('four failed attempts do not lock', () => {
    expect(lockedUntil([0, 1, 2, 3].map(minutes), minutes(4))).toBeNull();
  });

  it('five failed attempts in 15 minutes lock for 15 minutes from the fifth', () => {
    expect(lockedUntil([0, 3, 6, 9, 12].map(minutes), minutes(13))).toEqual(minutes(27));
  });

  it('five attempts spread over more than 15 minutes do not lock', () => {
    expect(lockedUntil([0, 4, 8, 12, 16].map(minutes), minutes(17))).toBeNull();
  });

  it('the lockout ends after 15 minutes', () => {
    const failures = [0, 1, 2, 3, 4].map(minutes);

    expect(lockedUntil(failures, minutes(18))).toEqual(minutes(19));
    expect(lockedUntil(failures, minutes(19))).toBeNull();
  });

  it('does not depend on the order of the attempts', () => {
    expect(lockedUntil([4, 2, 0, 3, 1].map(minutes), minutes(5))).toEqual(minutes(19));
  });

  it('the attempts of the last 30 minutes are enough to decide the lockout', () => {
    // The oldest fifth failure that still locks happened almost 15 minutes ago
    // and its first failure, 15 minutes before that.
    expect(relevantAttemptsSince(minutes(30))).toEqual(minutes(0));
  });
});
