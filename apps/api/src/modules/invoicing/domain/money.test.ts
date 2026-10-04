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

describe('importes con decimal exacto (RN-FAC-13)', () => {
  it('lee importes en euros como céntimos enteros, sin coma flotante', () => {
    expect(parseMoney('1234.56')).toBe(123456n);
    expect(parseMoney('0.1')).toBe(10n);
    expect(parseMoney('7')).toBe(700n);
    expect(parseMoney('-3.05')).toBe(-305n);
  });

  it('0,1 + 0,2 es exactamente 0,30', () => {
    expect(formatMoney(parseMoney('0.1') + parseMoney('0.2'))).toBe('0.30');
  });

  it('rechaza más de 2 decimales o texto que no es un importe', () => {
    for (const value of ['1.234', '1,23', 'abc', '', '1e3']) {
      expect(() => parseMoney(value)).toThrow(InvalidAmountError);
    }
  });

  it('formatea siempre con 2 decimales', () => {
    expect(formatMoney(5n)).toBe('0.05');
    expect(formatMoney(-150n)).toBe('-1.50');
    expect(formatMoney(100000000n)).toBe('1000000.00');
  });

  it('cantidades con hasta 3 decimales, en milésimas', () => {
    expect(parseQuantity('1250.5')).toBe(1250500n);
    expect(formatQuantity(1250500n)).toBe('1250.5');
    expect(formatQuantity(3000n)).toBe('3');
    expect(() => parseQuantity('1.2345')).toThrow(InvalidAmountError);
  });

  it('tipos de IVA en centésimas de punto', () => {
    expect(parseVatRate('21')).toBe(2100n);
    expect(parseVatRate('10.5')).toBe(1050n);
    expect(() => parseVatRate('101')).toThrow(InvalidAmountError);
  });
});

describe('cuadre de totales (RN-FAC-07)', () => {
  it('calcula el IVA redondeando a céntimos, mitad hacia arriba', () => {
    expect(vatAmount(parseMoney('100.00'), parseVatRate('21'))).toBe(2100n);
    // 10,05 × 21 % = 2,1105 → 2,11
    expect(vatAmount(parseMoney('10.05'), parseVatRate('21'))).toBe(211n);
    // 0,50 × 21 % = 0,105 → 0,11 (mitad hacia arriba)
    expect(vatAmount(parseMoney('0.50'), parseVatRate('21'))).toBe(11n);
  });

  it('acepta un total que coincide con base más IVA', () => {
    expect(() =>
      assertTotal(parseMoney('1000.00'), parseVatRate('21'), parseMoney('1210.00')),
    ).not.toThrow();
  });

  it('admite la tolerancia de 0,01 €', () => {
    expect(() =>
      assertTotal(parseMoney('10.05'), parseVatRate('21'), parseMoney('12.15')),
    ).not.toThrow();
    expect(() =>
      assertTotal(parseMoney('10.05'), parseVatRate('21'), parseMoney('12.17')),
    ).not.toThrow();
  });

  it('Dado un total que no coincide con base más IVA, entonces se rechaza indicando la diferencia', () => {
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
