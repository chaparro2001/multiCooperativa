import { describe, expect, it } from 'vitest';

import { formatMoney } from './money-format';

describe('formatMoney', () => {
  it.each([
    ['1234.50', undefined, '1.234,50 €', false],
    ['0.00', undefined, '0,00 €', false],
    ['500.00', true, '+500,00 €', false],
    ['-350.00', undefined, '−350,00 €', true],
    ['-350.00', true, '−350,00 €', true],
    ['-0.00', true, '0,00 €', false],
    ['0.00', true, '0,00 €', false],
    ['-1250000.5', undefined, '−1.250.000,50 €', true],
  ])('formats %s (signed: %s) as %s', (amount, signed, text, negative) => {
    expect(formatMoney(amount, 'es-ES', { signed })).toEqual({ text, negative });
  });

  it('never uses a hyphen for the minus sign', () => {
    expect(formatMoney('-1.00', 'es-ES').text).not.toContain('-');
  });
});
