import { describe, expect, it } from 'vitest';

import { computeResult, DEFAULT_POLICY, resolveResult } from './voting-result';

describe('result of a voting: table of section 9 (NFR-ASM-02)', () => {
  it.each([
    {
      census: 10,
      inFavor: 4,
      against: 1,
      abstentions: 0,
      majority: 'simple',
      call: 'first',
      expected: 'approved',
      why: '50 % participation',
    },
    {
      census: 10,
      inFavor: 3,
      against: 1,
      abstentions: 0,
      majority: 'simple',
      call: 'first',
      expected: 'no_quorum',
      why: '40 % < 50 %',
    },
    {
      census: 10,
      inFavor: 3,
      against: 1,
      abstentions: 0,
      majority: 'simple',
      call: 'second',
      expected: 'approved',
      why: 'no minimum in second call',
    },
    {
      census: 10,
      inFavor: 3,
      against: 3,
      abstentions: 2,
      majority: 'simple',
      call: 'first',
      expected: 'rejected',
      why: 'tie',
    },
    {
      census: 9,
      inFavor: 4,
      against: 2,
      abstentions: 0,
      majority: 'reinforced',
      call: 'second',
      expected: 'approved',
      why: '4/6 = 2/3',
    },
    {
      census: 9,
      inFavor: 3,
      against: 2,
      abstentions: 1,
      majority: 'reinforced',
      call: 'second',
      expected: 'rejected',
      why: '3/5 < 2/3',
    },
    {
      census: 10,
      inFavor: 0,
      against: 0,
      abstentions: 6,
      majority: 'simple',
      call: 'first',
      expected: 'rejected',
      why: 'no votes in favour',
    },
  ] as const)(
    'census $census, $inFavor/$against/$abstentions, $majority in $call -> $expected ($why)',
    ({ census, inFavor, against, abstentions, majority, call, expected }) => {
      const result = computeResult({
        census,
        tally: { inFavor, against, abstentions },
        majority,
        call,
        policy: DEFAULT_POLICY,
      });
      expect(result.outcome).toBe(expected);
    },
  );
});

describe('result detail (US-ASM-06)', () => {
  it('returns votes, participation over the census, quorum and the applied call', () => {
    expect(
      computeResult({
        census: 10,
        tally: { inFavor: 4, against: 1, abstentions: 2 },
        majority: 'simple',
        call: 'first',
        policy: DEFAULT_POLICY,
      }),
    ).toEqual({
      census: 10,
      inFavor: 4,
      against: 1,
      abstentions: 2,
      votesCast: 7,
      quorumReached: true,
      call: 'first',
      outcome: 'approved',
    });
  });

  it('BR-ASM-04: abstentions count for participation', () => {
    const result = computeResult({
      census: 10,
      tally: { inFavor: 1, against: 0, abstentions: 4 },
      majority: 'simple',
      call: 'first',
      policy: DEFAULT_POLICY,
    });
    expect(result).toMatchObject({ votesCast: 5, quorumReached: true, outcome: 'approved' });
  });

  it('BR-ASM-07: abstentions do not count for the majority', () => {
    const result = computeResult({
      census: 10,
      tally: { inFavor: 2, against: 1, abstentions: 7 },
      majority: 'reinforced',
      call: 'first',
      policy: DEFAULT_POLICY,
    });
    // 2/3 of in favour + against, even if they are 2 of 10 votes cast.
    expect(result.outcome).toBe('approved');
  });

  it('quorum is computed with exact arithmetic: 1 of 3 does not reach 33.34 %', () => {
    const policy = { ...DEFAULT_POLICY, quorumPercent: { first: 34, second: 0 } };
    const result = computeResult({
      census: 3,
      tally: { inFavor: 1, against: 0, abstentions: 0 },
      majority: 'simple',
      call: 'first',
      policy,
    });
    expect(result.quorumReached).toBe(false);
  });

  it('the reinforced majority fraction is configurable (BR-ASM-08)', () => {
    const policy = { ...DEFAULT_POLICY, reinforced: { numerator: 3, denominator: 4 } };
    const tally = { inFavor: 4, against: 2, abstentions: 0 };
    const input = { census: 9, tally, majority: 'reinforced', call: 'second', policy } as const;
    // 4/6 = 0.67 < 3/4
    expect(computeResult(input).outcome).toBe('rejected');
  });

  it('rejects an impossible count: more votes than census or negative', () => {
    const base = { majority: 'simple', call: 'first', policy: DEFAULT_POLICY } as const;
    expect(() =>
      computeResult({ ...base, census: 2, tally: { inFavor: 2, against: 1, abstentions: 0 } }),
    ).toThrow();
    expect(() =>
      computeResult({ ...base, census: 2, tally: { inFavor: -1, against: 0, abstentions: 0 } }),
    ).toThrow();
  });
});

describe('second call (US-ASM-07)', () => {
  const tally = { inFavor: 3, against: 1, abstentions: 0 };

  it('Given a configured second call, when there is no quorum in the first, then the second applies', () => {
    const result = resolveResult({
      census: 10,
      tally,
      majority: 'simple',
      policy: DEFAULT_POLICY,
      secondCallAvailable: true,
    });
    expect(result).toMatchObject({ call: 'second', quorumReached: true, outcome: 'approved' });
  });

  it('without a second call, it ends with no quorum (BR-ASM-06)', () => {
    const result = resolveResult({
      census: 10,
      tally,
      majority: 'simple',
      policy: DEFAULT_POLICY,
      secondCallAvailable: false,
    });
    expect(result).toMatchObject({ call: 'first', quorumReached: false, outcome: 'no_quorum' });
  });

  it('if there is quorum in the first call, it stays in the first even if a second exists', () => {
    const result = resolveResult({
      census: 10,
      tally: { inFavor: 5, against: 1, abstentions: 0 },
      majority: 'simple',
      policy: DEFAULT_POLICY,
      secondCallAvailable: true,
    });
    expect(result.call).toBe('first');
  });
});
