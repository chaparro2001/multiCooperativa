import { describe, expect, it } from 'vitest';

import {
  assertTotal,
  formatMoney,
  formatQuantity,
  parseMoney,
  parseQuantity,
  parseVatRate,
  vatAmount,
} from './money';
import { InvalidAmountError, TotalMismatchError } from './errors';

describe('exact decimal amounts (BR-INV-13)', () => {
  it('reads euro amounts as integer cents, without floating point', () => {
    expect(parseMoney('1234.56')).toBe(123456n);
    expect(parseMoney('0.1')).toBe(10n);
    expect(parseMoney('7')).toBe(700n);
    expect(parseMoney('-3.05')).toBe(-305n);
  });

  it('0.1 + 0.2 is exactly 0.30', () => {
    expect(formatMoney(parseMoney('0.1') + parseMoney('0.2'))).toBe('0.30');
  });

  it('rejects more than 2 decimals or text that is not an amount', () => {
    for (const value of ['1.234', '1,23', 'abc', '', '1e3']) {
      expect(() => parseMoney(value)).toThrow(InvalidAmountError);
    }
  });

  it('always formats with 2 decimals', () => {
    expect(formatMoney(5n)).toBe('0.05');
    expect(formatMoney(-150n)).toBe('-1.50');
    expect(formatMoney(100000000n)).toBe('1000000.00');
  });

  it('quantities with up to 3 decimals, in thousandths', () => {
    expect(parseQuantity('1250.5')).toBe(1250500n);
    expect(formatQuantity(1250500n)).toBe('1250.5');
    expect(formatQuantity(3000n)).toBe('3');
    expect(() => parseQuantity('1.2345')).toThrow(InvalidAmountError);
  });

  it('VAT rates in hundredths of a point', () => {
    expect(parseVatRate('21')).toBe(2100n);
    expect(parseVatRate('10.5')).toBe(1050n);
    expect(() => parseVatRate('101')).toThrow(InvalidAmountError);
  });
});

describe('total matching (BR-INV-07)', () => {
  it('computes VAT rounding to cents, half up', () => {
    expect(vatAmount(parseMoney('100.00'), parseVatRate('21'))).toBe(2100n);
    // 10,05 × 21 % = 2,1105 → 2,11
    expect(vatAmount(parseMoney('10.05'), parseVatRate('21'))).toBe(211n);
    // 0,50 × 21 % = 0,105 → 0,11 (mitad hacia arriba)
    expect(vatAmount(parseMoney('0.50'), parseVatRate('21'))).toBe(11n);
  });

  it('accepts a total that matches base plus VAT', () => {
    expect(() =>
      assertTotal(parseMoney('1000.00'), parseVatRate('21'), parseMoney('1210.00')),
    ).not.toThrow();
  });

  it('allows the 0.01 € tolerance', () => {
    expect(() =>
      assertTotal(parseMoney('10.05'), parseVatRate('21'), parseMoney('12.15')),
    ).not.toThrow();
    expect(() =>
      assertTotal(parseMoney('10.05'), parseVatRate('21'), parseMoney('12.17')),
    ).not.toThrow();
  });

  it('Given a total that does not match base plus VAT, then it is rejected stating the difference', () => {
    try {
      assertTotal(parseMoney('1000.00'), parseVatRate('21'), parseMoney('1200.00'));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TotalMismatchError);
      expect((error as TotalMismatchError).expected).toBe('1210.00');
      expect((error as TotalMismatchError).difference).toBe('-10.00');
      expect((error as Error).message).toContain('10.00');
    }
  });
});
