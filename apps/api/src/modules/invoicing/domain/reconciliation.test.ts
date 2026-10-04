import { describe, expect, it } from 'vitest';

import { parseQuantity } from './money';
import { DEFAULT_TOLERANCE_BASIS_POINTS, reconcile } from './reconciliation';

const line = (concept: string, quantity: string, unit = 'kg') => ({
  concept,
  quantity: parseQuantity(quantity),
  unit,
});

describe('conciliación automática (HU-FAC-04, RN-FAC-08)', () => {
  it('sin albaranes no se concilia', () => {
    expect(
      reconcile({
        invoiceLines: [line('Servicio', '1', 'ud')],
        noteLines: null,
        toleranceBasisPoints: 100,
      }),
    ).toEqual({
      status: 'sin_albaranes',
      discrepancies: [],
    });
  });

  it('Dado cantidades por concepto que coinciden, sumando varios albaranes, entonces queda conciliada', () => {
    const result = reconcile({
      invoiceLines: [line('Abono NPK', '1500')],
      noteLines: [line('Abono NPK', '1000'), line('abono  npk ', '500')],
      toleranceBasisPoints: DEFAULT_TOLERANCE_BASIS_POINTS,
    });
    expect(result).toEqual({ status: 'conciliada', discrepancies: [] });
  });

  it('dentro de la tolerancia del 1 % sigue conciliada', () => {
    const result = reconcile({
      invoiceLines: [line('Gasóleo', '1010', 'l')],
      noteLines: [line('Gasoleo', '1000', 'l')],
      toleranceBasisPoints: 100,
    });
    expect(result.status).toBe('conciliada');
  });

  it('Dado una diferencia superior a la tolerancia en un concepto, entonces queda con discrepancia y el detalle', () => {
    const result = reconcile({
      invoiceLines: [line('Gasóleo', '1011', 'l'), line('Abono', '50')],
      noteLines: [line('Gasóleo', '1000', 'l'), line('Abono', '50')],
      toleranceBasisPoints: 100,
    });
    expect(result).toEqual({
      status: 'con_discrepancia',
      discrepancies: [
        { concept: 'Gasóleo', unit: 'l', deliveredQuantity: 1000000n, invoicedQuantity: 1011000n },
      ],
    });
  });

  it('un concepto que aparece solo en un lado es discrepancia', () => {
    const result = reconcile({
      invoiceLines: [line('Abono', '50'), line('Transporte', '1', 'ud')],
      noteLines: [line('Abono', '50'), line('Palés', '4', 'ud')],
      toleranceBasisPoints: 100,
    });
    expect(result.discrepancies).toEqual([
      { concept: 'Transporte', unit: 'ud', deliveredQuantity: 0n, invoicedQuantity: 1000n },
      { concept: 'Palés', unit: 'ud', deliveredQuantity: 4000n, invoicedQuantity: 0n },
    ]);
  });

  it('el mismo concepto en otra unidad no se mezcla', () => {
    const result = reconcile({
      invoiceLines: [line('Abono', '1', 't')],
      noteLines: [line('Abono', '1000', 'kg')],
      toleranceBasisPoints: 100,
    });
    expect(result.status).toBe('con_discrepancia');
    expect(result.discrepancies).toHaveLength(2);
  });

  it('la tolerancia es configurable por cooperativa', () => {
    const lines = { invoiceLines: [line('Abono', '1030')], noteLines: [line('Abono', '1000')] };
    expect(reconcile({ ...lines, toleranceBasisPoints: 100 }).status).toBe('con_discrepancia');
    expect(reconcile({ ...lines, toleranceBasisPoints: 500 }).status).toBe('conciliada');
  });
});
