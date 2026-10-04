import { describe, expect, it } from 'vitest';

import { InvalidMembershipTransitionError } from './errors';
import {
  activate,
  canVote,
  grantsAccess,
  type MembershipStatus,
  reactivate,
  remove,
  suspend,
} from './membership';

const membership = (status: MembershipStatus, isPartner = true) => ({ status, isPartner });

describe('transiciones de la membresía (apartado 5)', () => {
  it.each([
    { name: 'aceptar invitación', transition: activate, from: 'invitada', to: 'activa' },
    { name: 'suspender', transition: suspend, from: 'activa', to: 'suspendida' },
    { name: 'reactivar', transition: reactivate, from: 'suspendida', to: 'activa' },
    { name: 'dar de baja una activa', transition: remove, from: 'activa', to: 'baja' },
    { name: 'dar de baja una suspendida', transition: remove, from: 'suspendida', to: 'baja' },
  ] as const)('$name: $from → $to', ({ transition, from, to }) => {
    expect(transition(membership(from))).toEqual(membership(to));
  });

  it.each([
    { name: 'activar', transition: activate, from: ['activa', 'suspendida', 'baja'] },
    { name: 'suspender', transition: suspend, from: ['invitada', 'suspendida', 'baja'] },
    { name: 'reactivar', transition: reactivate, from: ['invitada', 'activa', 'baja'] },
    { name: 'dar de baja', transition: remove, from: ['invitada', 'baja'] },
  ] as const)('$name se rechaza desde $from', ({ transition, from }) => {
    for (const status of from) {
      expect(() => transition(membership(status))).toThrow(InvalidMembershipTransitionError);
    }
  });

  it('la baja es un estado final (RN-ACC-14)', () => {
    const removed = membership('baja');
    for (const transition of [activate, suspend, reactivate, remove]) {
      expect(() => transition(removed)).toThrow(InvalidMembershipTransitionError);
    }
  });

  it('no muta la membresía original', () => {
    const original = membership('activa');
    suspend(original);
    expect(original.status).toBe('activa');
  });
});

describe('grantsAccess (RN-ACC-09)', () => {
  it.each([
    ['activa', true],
    ['invitada', false],
    ['suspendida', false],
    ['baja', false],
  ] as const)('una membresía %s concede acceso: %s', (status, expected) => {
    expect(grantsAccess(membership(status))).toBe(expected);
  });
});

describe('canVote (RN-ACC-06)', () => {
  it('vota un socio con membresía activa', () => {
    expect(canVote(membership('activa', true))).toBe(true);
  });

  it('no vota un miembro activo que no es socio', () => {
    expect(canVote(membership('activa', false))).toBe(false);
  });

  it.each(['invitada', 'suspendida', 'baja'] as const)(
    'no vota un socio con membresía %s',
    (status) => {
      expect(canVote(membership(status, true))).toBe(false);
    },
  );
});
