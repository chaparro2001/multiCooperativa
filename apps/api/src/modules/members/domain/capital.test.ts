import { describe, expect, it } from 'vitest';

import {
  balanceOf,
  createMovement,
  effectOf,
  MOVEMENT_TYPES,
  type NewMovementInput,
} from './capital';
import { InsufficientCapitalError, InvalidMovementError } from './errors';
import { formatMoney, parseMoney } from './money';

const input = (overrides: Partial<NewMovementInput> = {}): NewMovementInput => ({
  date: '2026-10-01',
  type: 'mandatory_contribution',
  concept: 'Initial contribution',
  amount: '100.00',
  ...overrides,
});

describe('money (BR-MEM-04)', () => {
  it('BR-MEM-04: parses and formats euros as integer cents, never floats', () => {
    expect(parseMoney('1234.56')).toBe(123456n);
    expect(parseMoney('0.1')).toBe(10n);
    expect(parseMoney('7')).toBe(700n);
    expect(formatMoney(123456n)).toBe('1234.56');
    expect(formatMoney(5n)).toBe('0.05');
    expect(formatMoney(-250n)).toBe('-2.50');
  });

  it('BR-MEM-04: 0.1 + 0.2 is exactly 0.30', () => {
    expect(formatMoney(parseMoney('0.1') + parseMoney('0.2'))).toBe('0.30');
  });

  it.each(['', 'abc', '1,5', '1.234', '1e3', '--1'])('BR-MEM-04: rejects "%s"', (text) => {
    expect(() => parseMoney(text)).toThrow(InvalidMovementError);
  });
});

describe('capital of a member (BR-MEM-03)', () => {
  it('BR-MEM-02: the four movement types exist', () => {
    expect([...MOVEMENT_TYPES]).toEqual([
      'mandatory_contribution',
      'voluntary_contribution',
      'refund',
      'correction',
    ]);
  });

  it('BR-MEM-03: contributions add, refunds subtract, corrections keep their sign', () => {
    expect(effectOf('mandatory_contribution', 1000n)).toBe(1000n);
    expect(effectOf('voluntary_contribution', 1000n)).toBe(1000n);
    expect(effectOf('refund', 400n)).toBe(-400n);
    expect(effectOf('correction', -150n)).toBe(-150n);
    expect(effectOf('correction', 150n)).toBe(150n);
  });

  it('US-MEM-02: no movements means zero capital', () => {
    expect(balanceOf([])).toBe(0n);
  });

  it('BR-MEM-03: capital = contributions - refunds +- corrections', () => {
    const balance = balanceOf([
      { type: 'mandatory_contribution', amountCents: 60000n },
      { type: 'voluntary_contribution', amountCents: 12050n },
      { type: 'refund', amountCents: 10000n },
      { type: 'correction', amountCents: -50n },
      { type: 'correction', amountCents: 200n },
    ]);
    expect(formatMoney(balance)).toBe('622.00');
  });
});

describe('registering a movement (US-MEM-03)', () => {
  it('US-MEM-03: a valid contribution is added and the capital is recalculated', () => {
    const movement = createMovement(input(), 0n);
    expect(movement).toMatchObject({
      date: '2026-10-01',
      type: 'mandatory_contribution',
      concept: 'Initial contribution',
      amountCents: 10000n,
    });
    expect(balanceOf([movement])).toBe(10000n);
  });

  it('US-MEM-03: a refund greater than the available capital is rejected', () => {
    expect(() => createMovement(input({ type: 'refund', amount: '100.01' }), 10000n)).toThrow(
      InsufficientCapitalError,
    );
  });

  it('BR-MEM-03: a refund of exactly the available capital leaves zero, never negative', () => {
    const movement = createMovement(input({ type: 'refund', amount: '100.00' }), 10000n);
    expect(10000n + effectOf(movement.type, movement.amountCents)).toBe(0n);
  });

  it('BR-MEM-03: the error tells the available capital', () => {
    try {
      createMovement(input({ type: 'refund', amount: '50.00' }), 2000n);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientCapitalError);
      expect((error as InsufficientCapitalError).available).toBe('20.00');
    }
  });

  it('BR-MEM-01: a mistake is corrected with a movement of opposite sign', () => {
    const wrong = createMovement(input({ amount: '500.00' }), 0n);
    const fix = createMovement(input({ type: 'correction', amount: '-500.00' }), 50000n);
    expect(balanceOf([wrong, fix])).toBe(0n);
  });

  it('BR-MEM-03: a correction that would leave negative capital is rejected', () => {
    expect(() => createMovement(input({ type: 'correction', amount: '-10.00' }), 500n)).toThrow(
      InsufficientCapitalError,
    );
  });

  it.each(['0', '0.00', '-5.00'])(
    'US-MEM-03: contributions and refunds need a positive amount (%s)',
    (amount) => {
      for (const type of ['mandatory_contribution', 'voluntary_contribution', 'refund'] as const) {
        expect(() => createMovement(input({ type, amount }), 100000n)).toThrow(
          InvalidMovementError,
        );
      }
    },
  );

  it('BR-MEM-02: a correction may be negative but never zero', () => {
    expect(() => createMovement(input({ type: 'correction', amount: '0.00' }), 0n)).toThrow(
      InvalidMovementError,
    );
    expect(createMovement(input({ type: 'correction', amount: '1.00' }), 0n).amountCents).toBe(
      100n,
    );
  });

  it('BR-MEM-04: more than two decimals is rejected, not rounded', () => {
    expect(() => createMovement(input({ amount: '10.005' }), 0n)).toThrow(InvalidMovementError);
  });

  it('BR-MEM-04: the amount must fit the column (12 digits, 2 decimals)', () => {
    expect(() => createMovement(input({ amount: '10000000000.00' }), 0n)).toThrow(
      InvalidMovementError,
    );
    expect(createMovement(input({ amount: '9999999999.99' }), 0n).amountCents).toBe(999999999999n);
  });

  it('US-MEM-03: needs a real date, a known type and a concept', () => {
    expect(() => createMovement(input({ date: '2026-02-30' }), 0n)).toThrow(InvalidMovementError);
    expect(() => createMovement(input({ date: '01/10/2026' }), 0n)).toThrow(InvalidMovementError);
    expect(() => createMovement(input({ type: 'bonus' as never }), 0n)).toThrow(
      InvalidMovementError,
    );
    expect(() => createMovement(input({ concept: '   ' }), 0n)).toThrow(InvalidMovementError);
    expect(() => createMovement(input({ concept: 'x'.repeat(201) }), 0n)).toThrow(
      InvalidMovementError,
    );
  });

  it('US-MEM-03: the concept is trimmed', () => {
    expect(createMovement(input({ concept: '  Share  ' }), 0n).concept).toBe('Share');
  });

  it('BR-MEM-01: a registered movement is immutable', () => {
    const movement = createMovement(input(), 0n);
    expect(Object.isFrozen(movement)).toBe(true);
    expect(() => {
      (movement as { amountCents: bigint }).amountCents = 1n;
    }).toThrow(TypeError);
  });
});
