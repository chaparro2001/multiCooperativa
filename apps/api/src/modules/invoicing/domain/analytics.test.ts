import { describe, expect, it } from 'vitest';

import {
  bucketByDueDate,
  daysBetween,
  normalizeConcept,
  periodOf,
  rankItems,
  type ItemLine,
} from './analytics';

const line = (date: string, concept: string, quantity: bigint, unit = 'kg'): ItemLine => ({
  date,
  concept,
  quantity,
  unit,
});

describe('US-AI-02 · normalizeConcept', () => {
  it.each([
    ['Aceite  de OLIVA ', 'aceite de oliva'],
    ['Fertilizante nitrógeno', 'fertilizante nitrogeno'],
    ['  Abono\tNPK  ', 'abono npk'],
  ])('given %j, when normalized, then %j', (input, expected) => {
    expect(normalizeConcept(input)).toBe(expected);
  });
});

describe('US-AI-02 · rankItems (top_items)', () => {
  const lines = [
    line('2026-01-10', 'Aceite de oliva', 1000n),
    line('2026-02-10', 'aceite  de OLIVA', 2000n),
    line('2026-02-11', 'Aceite de oliva', 500n),
    line('2026-02-12', 'Abono NPK', 9000n),
    line('2026-02-12', 'Abono NPK', 1000n, 'saco'),
    line('2026-03-01', 'Fertilizante', 100n),
  ];

  it('given spellings that differ in case and spaces, when ranked, then they add up under the most common one', () => {
    const { rows } = rankItems(lines, { limit: 10 });

    expect(rows.map((row) => [row.concept, row.unit, row.quantity])).toEqual([
      ['Abono NPK', 'kg', 9000n],
      ['Aceite de oliva', 'kg', 3500n],
      ['Abono NPK', 'saco', 1000n],
      ['Fertilizante', 'kg', 100n],
    ]);
  });

  it('given the same concept in two units, when ranked, then they are never added together', () => {
    const { rows } = rankItems(lines, { concept: 'abono', limit: 10 });

    expect(rows).toHaveLength(2);
  });

  it('given a limit, when there are more items, then it is truncated and reports the total', () => {
    const result = rankItems(lines, { limit: 2 });

    expect(result.rows).toHaveLength(2);
    expect(result).toMatchObject({ total: 4, truncated: true });
  });

  it('given a concept filter with accents and case, when ranked, then it matches normalized', () => {
    const { rows } = rankItems([line('2026-01-01', 'Nitrógeno', 5n)], {
      concept: 'NITROGENO',
      limit: 5,
    });

    expect(rows).toHaveLength(1);
  });

  it('given group by month, when ranked, then months come oldest first for the leading items', () => {
    const { rows } = rankItems(lines, { concept: 'aceite', groupBy: 'month', limit: 5 });

    expect(rows.map((row) => [row.period, row.concept, row.quantity])).toEqual([
      ['2026-01', 'Aceite de oliva', 1000n],
      ['2026-02', 'Aceite de oliva', 2500n],
    ]);
  });

  it('given a tie in spellings, when labelled, then the alphabetically first wins', () => {
    const { rows } = rankItems([line('2026-01-01', 'Trigo', 1n), line('2026-01-02', 'trigo', 1n)], {
      limit: 1,
    });

    expect(rows[0]!.concept).toBe('Trigo');
  });

  it('given no lines, when ranked, then nothing comes back', () => {
    expect(rankItems([], { limit: 3 })).toEqual({ rows: [], total: 0, truncated: false });
  });
});

describe('US-AI-02 · periodOf and bucketByDueDate (cash_forecast)', () => {
  it.each([
    ['2026-10-21', 'week', '2026-10-19', '2026-10-25'],
    ['2026-10-19', 'week', '2026-10-19', '2026-10-25'],
    ['2026-10-25', 'week', '2026-10-19', '2026-10-25'],
    ['2026-02-10', 'month', '2026-02-01', '2026-02-28'],
    ['2028-02-10', 'month', '2028-02-01', '2028-02-29'],
    ['2026-12-31', 'month', '2026-12-01', '2026-12-31'],
  ] as const)('given %s by %s, then it is %s to %s', (day, granularity, from, to) => {
    expect(periodOf(day, granularity)).toEqual({ from, to });
  });

  it('given invoices due in different weeks, when bucketed, then they are ordered and kept apart by operation', () => {
    const buckets = bucketByDueDate(
      [
        { operation: 'purchase', dueDate: '2026-10-28', total: 12100n, overdue: false },
        { operation: 'purchase', dueDate: '2026-10-20', total: 30000n, overdue: true },
        { operation: 'purchase', dueDate: '2026-10-21', total: 100n, overdue: false },
        { operation: 'sale', dueDate: '2026-10-22', total: 50000n, overdue: false },
      ],
      'week',
    );

    expect(buckets).toEqual([
      {
        from: '2026-10-19',
        to: '2026-10-25',
        toPay: { total: 30100n, count: 2, overdueTotal: 30000n, overdueCount: 1 },
        toCollect: { total: 50000n, count: 1, overdueTotal: 0n, overdueCount: 0 },
      },
      {
        from: '2026-10-26',
        to: '2026-11-01',
        toPay: { total: 12100n, count: 1, overdueTotal: 0n, overdueCount: 0 },
        toCollect: { total: 0n, count: 0, overdueTotal: 0n, overdueCount: 0 },
      },
    ]);
  });

  it('given a month granularity, when bucketed, then the week boundary does not split the month', () => {
    const buckets = bucketByDueDate(
      [
        { operation: 'sale', dueDate: '2026-10-31', total: 1n, overdue: false },
        { operation: 'sale', dueDate: '2026-10-01', total: 2n, overdue: false },
      ],
      'month',
    );

    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.toCollect.total).toBe(3n);
  });
});

describe('US-AI-02 · daysBetween (age of a delivery note)', () => {
  it.each([
    ['2026-10-01', '2026-10-20', 19],
    ['2026-10-20', '2026-10-20', 0],
    ['2026-10-25', '2026-10-20', 0],
    ['2026-02-27', '2026-03-02', 3],
  ])('given %s and %s, then %i days', (from, to, days) => {
    expect(daysBetween(from, to)).toBe(days);
  });
});
