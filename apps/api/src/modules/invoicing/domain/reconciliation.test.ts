import { describe, expect, it } from 'vitest';

import { parseQuantity } from './money';
import { DEFAULT_TOLERANCE_BASIS_POINTS, reconcile } from './reconciliation';

const line = (concept: string, quantity: string, unit = 'kg') => ({
  concept,
  quantity: parseQuantity(quantity),
  unit,
});

describe('automatic reconciliation (US-INV-04, BR-INV-08)', () => {
  it('without delivery notes it is not reconciled', () => {
    expect(
      reconcile({
        invoiceLines: [line('Servicio', '1', 'ud')],
        noteLines: null,
        toleranceBasisPoints: 100,
      }),
    ).toEqual({
      status: 'no_delivery_notes',
      discrepancies: [],
    });
  });

  it('Given quantities per concept that match, adding several delivery notes, then it is reconciled', () => {
    const result = reconcile({
      invoiceLines: [line('Fertilizer NPK', '1500')],
      noteLines: [line('Fertilizer NPK', '1000'), line('fertilizer  npk ', '500')],
      toleranceBasisPoints: DEFAULT_TOLERANCE_BASIS_POINTS,
    });
    expect(result).toEqual({ status: 'reconciled', discrepancies: [] });
  });

  it('within the 1 % tolerance it stays reconciled', () => {
    const result = reconcile({
      invoiceLines: [line('Diesel', '1010', 'l')],
      noteLines: [line('Diesel', '1000', 'l')],
      toleranceBasisPoints: 100,
    });
    expect(result.status).toBe('reconciled');
  });

  it('Given a difference above the tolerance in a concept, then it is left with a discrepancy and the detail', () => {
    const result = reconcile({
      invoiceLines: [line('Diesel', '1011', 'l'), line('Fertilizer', '50')],
      noteLines: [line('Diesel', '1000', 'l'), line('Fertilizer', '50')],
      toleranceBasisPoints: 100,
    });
    expect(result).toEqual({
      status: 'with_discrepancy',
      discrepancies: [
        { concept: 'Diesel', unit: 'l', deliveredQuantity: 1000000n, invoicedQuantity: 1011000n },
      ],
    });
  });

  it('a concept that appears on one side only is a discrepancy', () => {
    const result = reconcile({
      invoiceLines: [line('Fertilizer', '50'), line('Transporte', '1', 'ud')],
      noteLines: [line('Fertilizer', '50'), line('Pallets', '4', 'ud')],
      toleranceBasisPoints: 100,
    });
    expect(result.discrepancies).toEqual([
      { concept: 'Transporte', unit: 'ud', deliveredQuantity: 0n, invoicedQuantity: 1000n },
      { concept: 'Pallets', unit: 'ud', deliveredQuantity: 4000n, invoicedQuantity: 0n },
    ]);
  });

  it('the same concept in another unit is not mixed', () => {
    const result = reconcile({
      invoiceLines: [line('Fertilizer', '1', 't')],
      noteLines: [line('Fertilizer', '1000', 'kg')],
      toleranceBasisPoints: 100,
    });
    expect(result.status).toBe('with_discrepancy');
    expect(result.discrepancies).toHaveLength(2);
  });

  it('the tolerance is configurable per cooperative', () => {
    const lines = {
      invoiceLines: [line('Fertilizer', '1030')],
      noteLines: [line('Fertilizer', '1000')],
    };
    expect(reconcile({ ...lines, toleranceBasisPoints: 100 }).status).toBe('with_discrepancy');
    expect(reconcile({ ...lines, toleranceBasisPoints: 500 }).status).toBe('reconciled');
  });
});
