import { describe, expect, it } from 'vitest';

import { InvalidMemberNifError, InvalidMembershipTransitionError } from './errors';
import {
  activate,
  canVote,
  grantsAccess,
  type MembershipStatus,
  parseMemberNif,
  reactivate,
  remove,
  suspend,
} from './membership';

const membership = (status: MembershipStatus, isPartner = true) => ({ status, isPartner });

describe('membership transitions (section 5)', () => {
  it.each([
    { name: 'accept invitation', transition: activate, from: 'invited', to: 'active' },
    { name: 'suspender', transition: suspend, from: 'active', to: 'suspended' },
    { name: 'reactivar', transition: reactivate, from: 'suspended', to: 'active' },
    { name: 'dar de baja una activa', transition: remove, from: 'active', to: 'removed' },
    { name: 'dar de baja una suspendida', transition: remove, from: 'suspended', to: 'removed' },
  ] as const)('$name: $from → $to', ({ transition, from, to }) => {
    expect(transition(membership(from))).toEqual(membership(to));
  });

  it.each([
    { name: 'activar', transition: activate, from: ['active', 'suspended', 'removed'] },
    { name: 'suspender', transition: suspend, from: ['invited', 'suspended', 'removed'] },
    { name: 'reactivar', transition: reactivate, from: ['invited', 'active', 'removed'] },
    { name: 'dar de baja', transition: remove, from: ['invited', 'removed'] },
  ] as const)('$name is rejected from $from', ({ transition, from }) => {
    for (const status of from) {
      expect(() => transition(membership(status))).toThrow(InvalidMembershipTransitionError);
    }
  });

  it('removal is a final state (BR-ACC-14)', () => {
    const removed = membership('removed');
    for (const transition of [activate, suspend, reactivate, remove]) {
      expect(() => transition(removed)).toThrow(InvalidMembershipTransitionError);
    }
  });

  it('does not mutate the original membership', () => {
    const original = membership('active');
    suspend(original);
    expect(original.status).toBe('active');
  });
});

describe('grantsAccess (BR-ACC-09)', () => {
  it.each([
    ['active', true],
    ['invited', false],
    ['suspended', false],
    ['removed', false],
  ] as const)('a %s membership grants access: %s', (status, expected) => {
    expect(grantsAccess(membership(status))).toBe(expected);
  });
});

describe('canVote (BR-ACC-06)', () => {
  it('a partner with an active membership votes', () => {
    expect(canVote(membership('active', true))).toBe(true);
  });

  it('an active member who is not a partner does not vote', () => {
    expect(canVote(membership('active', false))).toBe(false);
  });

  it.each(['invited', 'suspended', 'removed'] as const)(
    'a partner with a %s membership does not vote',
    (status) => {
      expect(canVote(membership(status, true))).toBe(false);
    },
  );
});

describe('the NIF of a partner (ADR-025, BR-ACC-18)', () => {
  it.each([
    ['12345678z', '12345678Z'],
    [' 12.345.678-Z ', '12345678Z'],
    ['x-1234567-l', 'X1234567L'],
    ['b 12345674', 'B12345674'],
  ])('normalizes %s to %s', (raw, stored) => {
    expect(parseMemberNif(raw)).toBe(stored);
  });

  it.each([undefined, null, '', '   '])('treats %j as no NIF', (raw) => {
    expect(parseMemberNif(raw)).toBeNull();
  });

  it.each(['12345678A', 'B12345675', '1234567Z', 'ABCDEFGHI'])(
    'rejects %s: the same rule as a third party NIF',
    (raw) => {
      expect(() => parseMemberNif(raw)).toThrow(InvalidMemberNifError);
    },
  );
});
