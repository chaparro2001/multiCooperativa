import { describe, expect, it } from 'vitest';

import {
  computeTotal,
  formatEuros,
  normalizeAmountInput,
  normalizeQuantityInput,
  normalizeVatInput,
  subtractAmounts,
} from './amounts';

describe('amount input (BR-INV-13)', () => {
  it('normalizes European and plain notations to a decimal string', () => {
    expect(normalizeAmountInput('1.234,5')).toBe('1234.50');
    expect(normalizeAmountInput('1234.50')).toBe('1234.50');
    expect(normalizeAmountInput(' 100 € ')).toBe('100.00');
    expect(normalizeAmountInput('1,234.56')).toBe('1234.56');
    expect(normalizeAmountInput('12,5')).toBe('12.50');
  });

  it('rejects text and more than 2 decimals', () => {
    expect(normalizeAmountInput('abc')).toBeNull();
    expect(normalizeAmountInput('1.234')).toBeNull();
    expect(normalizeAmountInput('')).toBeNull();
  });

  it('normalizes quantities (up to 3 decimals) and VAT rates', () => {
    expect(normalizeQuantityInput('1250,5')).toBe('1250.5');
    expect(normalizeQuantityInput('0')).toBe('0');
    expect(normalizeQuantityInput('1.2345')).toBeNull();
    expect(normalizeVatInput('21 %')).toBe('21');
    expect(normalizeVatInput('10,5')).toBe('10.5');
    expect(normalizeVatInput('x')).toBeNull();
  });
});

describe('BR-INV-07 total = base + VAT', () => {
  it('computes it with exact cents', () => {
    expect(computeTotal('1000.00', '21')).toBe('1210.00');
    expect(computeTotal('100,00', '10')).toBe('110.00');
  });

  it('rounds the VAT half up, without floating point', () => {
    // 0.35 * 21 % = 0.0735 → 0.07 ; 0.50 * 21 % = 0.105 → 0.11 (a float would give 0.10)
    expect(computeTotal('0.35', '21')).toBe('0.42');
    expect(computeTotal('0.50', '21')).toBe('0.61');
  });

  it('returns null for invalid inputs', () => {
    expect(computeTotal('', '21')).toBeNull();
    expect(computeTotal('10', 'x')).toBeNull();
  });
});

describe('formatEuros', () => {
  it('groups thousands and uses the locale decimal mark', () => {
    expect(formatEuros('1234567.80', 'es-ES')).toBe('1.234.567,80 €');
    expect(formatEuros('-5.00', 'es-ES')).toBe('-5,00 €');
  });
});

describe('subtractAmounts', () => {
  it('is exact on cents', () => {
    expect(subtractAmounts('1210.00', '1000.00')).toBe('210.00');
    expect(subtractAmounts('0.30', '0.10')).toBe('0.20');
  });
});
