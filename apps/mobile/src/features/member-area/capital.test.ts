import type { MemberCapital } from '@multicooperativa/contracts';
import { describe, expect, it } from 'vitest';

import { capitalChange, changeTone, filterPartners, movementRequest } from './capital';

describe('capital statement (US-MEM-02, BR-MEM-03)', () => {
  it('BR-MEM-03: contributions add, refunds take out, corrections keep their sign', () => {
    expect(capitalChange('mandatory_contribution', '600.00')).toBe('600.00');
    expect(capitalChange('voluntary_contribution', '0.10')).toBe('0.10');
    expect(capitalChange('refund', '100.00')).toBe('-100.00');
    expect(capitalChange('correction', '-0.50')).toBe('-0.50');
    expect(capitalChange('correction', '2.00')).toBe('2.00');
  });

  it('BR-MEM-04: stays on decimal strings, never floats', () => {
    expect(capitalChange('refund', '0.30')).toBe('-0.30');
  });

  it('colours money in and money out', () => {
    expect(changeTone('600.00')).toBe('info');
    expect(changeTone('-100.00')).toBe('danger');
    expect(changeTone('0.00')).toBe('neutral');
  });
});

describe('partner search (US-MEM-04)', () => {
  const item = (name: string, email: string, partnerNumber: string | null): MemberCapital => ({
    member: {
      membershipId: '00000000-0000-4000-8000-000000000001',
      name,
      email,
      partnerNumber,
      isPartner: true,
      status: 'active',
      profileName: 'Socio',
      joinedAt: '2026-01-01',
    },
    capital: '0.00',
  });
  const items = [
    item('Javier López', 'socio@sanisidro.test', '003'),
    item('Lucía Martín', 'lucia@demo.test', '004'),
  ];

  it('searches by name without accents or case, by email and by partner number', () => {
    expect(filterPartners(items, 'lopez').map((i) => i.member.name)).toEqual(['Javier López']);
    expect(filterPartners(items, 'LUCÍA').map((i) => i.member.name)).toEqual(['Lucía Martín']);
    expect(filterPartners(items, 'demo.test')).toHaveLength(1);
    expect(filterPartners(items, '004')).toHaveLength(1);
  });

  it('an empty search keeps the server order', () => {
    expect(filterPartners(items, '  ').map((i) => i.member.partnerNumber)).toEqual(['003', '004']);
  });
});

describe('movement form (US-MEM-03)', () => {
  const draft = {
    type: 'mandatory_contribution' as const,
    date: '2026-10-05',
    concept: '  Entry  ',
    amount: '1.250,50',
  };

  it('US-MEM-03: normalizes the amount and trims the concept', () => {
    expect(movementRequest(draft)).toEqual({
      ok: true,
      request: {
        date: '2026-10-05',
        type: 'mandatory_contribution',
        concept: 'Entry',
        amount: '1250.50',
      },
    });
  });

  it('US-MEM-03: needs a concept and a valid amount', () => {
    expect(movementRequest({ ...draft, concept: ' ' })).toEqual({
      ok: false,
      error: 'concept_missing',
    });
    expect(movementRequest({ ...draft, amount: 'abc' })).toEqual({
      ok: false,
      error: 'amount_invalid',
    });
    expect(movementRequest({ ...draft, amount: '10,005' })).toEqual({
      ok: false,
      error: 'amount_invalid',
    });
  });

  it('US-MEM-03: contributions and refunds must be positive', () => {
    for (const amount of ['0', '0,00', '-5']) {
      expect(movementRequest({ ...draft, type: 'refund', amount })).toEqual({
        ok: false,
        error: 'amount_not_positive',
      });
    }
  });

  it('BR-MEM-01: a correction may be negative (opposite sign), never zero', () => {
    expect(movementRequest({ ...draft, type: 'correction', amount: '-50' })).toMatchObject({
      ok: true,
      request: { amount: '-50.00' },
    });
    expect(movementRequest({ ...draft, type: 'correction', amount: '0' })).toEqual({
      ok: false,
      error: 'amount_not_positive',
    });
  });
});
