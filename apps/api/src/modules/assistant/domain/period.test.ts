import { describe, expect, it } from 'vitest';

import { PERIODS, rangeFor, resolvePeriod, type Period } from './period';

describe('US-AI-08 · resolvePeriod (fixed clock)', () => {
  // 2026-10-23 is a Friday.
  it.each<[Period, string, string, string]>([
    ['today', '2026-10-23', '2026-10-23', '2026-10-23'],
    ['this_week', '2026-10-23', '2026-10-19', '2026-10-25'],
    ['last_week', '2026-10-23', '2026-10-12', '2026-10-18'],
    ['next_week', '2026-10-23', '2026-10-26', '2026-11-01'],
    ['this_month', '2026-10-23', '2026-10-01', '2026-10-31'],
    ['last_month', '2026-10-23', '2026-09-01', '2026-09-30'],
    ['next_month', '2026-10-23', '2026-11-01', '2026-11-30'],
    ['this_quarter', '2026-10-23', '2026-10-01', '2026-12-31'],
    ['last_quarter', '2026-10-23', '2026-07-01', '2026-09-30'],
    ['this_year', '2026-10-23', '2026-01-01', '2026-12-31'],
    ['last_year', '2026-10-23', '2025-01-01', '2025-12-31'],
    ['last_30_days', '2026-10-23', '2026-09-24', '2026-10-23'],
    ['next_30_days', '2026-10-23', '2026-10-23', '2026-11-21'],
  ])('%s on %s is %s to %s', (period, today, from, to) => {
    expect(resolvePeriod(period, today)).toEqual({ from, to });
  });

  it.each([
    ['a Monday starts its own week', '2026-10-19', '2026-10-19', '2026-10-25'],
    ['a Sunday ends its own week', '2026-10-25', '2026-10-19', '2026-10-25'],
    ['a week across the year boundary', '2026-12-31', '2026-12-28', '2027-01-03'],
  ])('this_week: %s', (_name, today, from, to) => {
    expect(resolvePeriod('this_week', today)).toEqual({ from, to });
  });

  it.each([
    [
      'last_month in January goes to the previous December',
      'last_month',
      '2026-01-15',
      '2025-12-01',
      '2025-12-31',
    ],
    [
      'next_month in December goes to the next January',
      'next_month',
      '2026-12-15',
      '2027-01-01',
      '2027-01-31',
    ],
    [
      'last_quarter in Q1 is Q4 of the previous year',
      'last_quarter',
      '2026-02-10',
      '2025-10-01',
      '2025-12-31',
    ],
    ['this_quarter in Q1', 'this_quarter', '2026-03-31', '2026-01-01', '2026-03-31'],
    ['this_quarter in Q2', 'this_quarter', '2026-04-01', '2026-04-01', '2026-06-30'],
    ['this_month in a leap February', 'this_month', '2028-02-10', '2028-02-01', '2028-02-29'],
    ['this_month in a common February', 'this_month', '2027-02-10', '2027-02-01', '2027-02-28'],
    [
      'last_month from March of a leap year',
      'last_month',
      '2028-03-01',
      '2028-02-01',
      '2028-02-29',
    ],
    ['last_30_days crosses the leap day', 'last_30_days', '2028-03-10', '2028-02-10', '2028-03-10'],
    ['next_30_days crosses the year end', 'next_30_days', '2026-12-20', '2026-12-20', '2027-01-18'],
  ] as const)('%s', (_name, period, today, from, to) => {
    expect(resolvePeriod(period, today)).toEqual({ from, to });
  });

  it('resolves every period in the enum', () => {
    for (const period of PERIODS) {
      const { from, to } = resolvePeriod(period, '2026-10-23');
      expect(from <= to).toBe(true);
    }
  });
});

describe('US-AI-08 · rangeFor: explicit dates win over the period', () => {
  it('uses the period when no date is given, and reports the dates it resolved to', () => {
    expect(rangeFor('this_quarter', {}, '2026-10-23')).toEqual({
      from: '2026-10-01',
      to: '2026-12-31',
      period: { from: '2026-10-01', to: '2026-12-31' },
    });
  });

  it.each([{ from: '2026-01-01' }, { to: '2026-02-01' }, { from: '2026-01-01', to: '2026-02-01' }])(
    'ignores the period when %j is given',
    (explicit) => {
      expect(rangeFor('this_year', explicit, '2026-10-23')).toEqual({
        from: undefined,
        to: undefined,
        ...explicit,
      });
    },
  );

  it('without period nor dates leaves the range open', () => {
    expect(rangeFor(undefined, {}, '2026-10-23')).toEqual({});
  });
});
