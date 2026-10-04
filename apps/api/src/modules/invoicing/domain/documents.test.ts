import { describe, expect, it } from 'vitest';

import {
  addDays,
  assertCanGroup,
  assertCanOperate,
  cancelDeliveryNote,
  cancelInvoice,
  createDeliveryNote,
  createInvoice,
  createThirdParty,
  deactivate,
  isDueSoon,
  markOverdue,
  settle,
} from './documents';
import {
  InvalidDocumentError,
  InvalidInvoiceTransitionError,
  InvalidThirdPartyError,
  TotalMismatchError,
} from './errors';

const supplier = createThirdParty({
  nif: 'b-12345674',
  name: ' Abonos del Sur SL ',
  isSupplier: true,
  isCustomer: false,
  email: null,
  phone: null,
});
const customer = createThirdParty({
  nif: '12345678Z',
  name: 'Almazara Norte',
  isSupplier: false,
  isCustomer: true,
  email: 'compras@norte.es',
  phone: null,
});

describe('terceros (HU-FAC-01)', () => {
  it('normaliza el NIF y el nombre', () => {
    expect(supplier).toMatchObject({ nif: 'B12345674', name: 'Abonos del Sur SL', active: true });
  });

  it('rechaza un NIF con el dígito de control incorrecto (RNF-FAC-06)', () => {
    expect(() =>
      createThirdParty({
        nif: 'B12345675',
        name: 'X',
        isSupplier: true,
        isCustomer: false,
        email: null,
        phone: null,
      }),
    ).toThrow(/NIF/);
  });

  it('debe ser proveedor, cliente o ambos', () => {
    expect(() =>
      createThirdParty({
        nif: 'B12345674',
        name: 'X',
        isSupplier: false,
        isCustomer: false,
        email: null,
        phone: null,
      }),
    ).toThrow(InvalidThirdPartyError);
  });

  it('RN-FAC-03: un albarán de compra solo admite proveedores y uno de venta solo clientes', () => {
    expect(() => assertCanOperate(supplier, 'compra')).not.toThrow();
    expect(() => assertCanOperate(supplier, 'venta')).toThrow(/cliente/);
    expect(() => assertCanOperate(customer, 'compra')).toThrow(/proveedor/);
  });

  it('RN-FAC-14: un tercero desactivado deja de ofrecerse para nuevos registros', () => {
    expect(() => assertCanOperate(deactivate(supplier), 'compra')).toThrow(/desactivado/);
  });
});

const line = (concept: string, quantity: string, unit = 'kg') => ({ concept, quantity, unit });

describe('albaranes (HU-FAC-02)', () => {
  it('queda pendiente de facturar con sus líneas', () => {
    const note = createDeliveryNote({
      operation: 'compra',
      number: ' A-001 ',
      date: '2026-10-01',
      lines: [line('Abono NPK', '1250.5')],
    });

    expect(note).toMatchObject({ status: 'pendiente_facturar', number: 'A-001' });
    expect(note.lines).toEqual([{ concept: 'Abono NPK', quantity: 1250500n, unit: 'kg' }]);
  });

  it('Dado una línea con cantidad cero o negativa, entonces se rechaza', () => {
    for (const quantity of ['0', '-1']) {
      expect(() =>
        createDeliveryNote({
          operation: 'compra',
          number: 'A-1',
          date: '2026-10-01',
          lines: [line('X', quantity)],
        }),
      ).toThrow(InvalidDocumentError);
    }
  });

  it('necesita al menos una línea con concepto y unidad', () => {
    expect(() =>
      createDeliveryNote({ operation: 'compra', number: 'A-1', date: '2026-10-01', lines: [] }),
    ).toThrow(InvalidDocumentError);
    expect(() =>
      createDeliveryNote({
        operation: 'compra',
        number: 'A-1',
        date: '2026-10-01',
        lines: [line(' ', '1')],
      }),
    ).toThrow(InvalidDocumentError);
  });

  it('se anula solo mientras está pendiente de facturar', () => {
    const note = createDeliveryNote({
      operation: 'compra',
      number: 'A-1',
      date: '2026-10-01',
      lines: [line('X', '1')],
    });
    expect(cancelDeliveryNote(note).status).toBe('anulado');
    expect(() => cancelDeliveryNote({ ...note, status: 'facturado' })).toThrow(
      InvalidInvoiceTransitionError,
    );
  });
});

const invoiceInput = {
  operation: 'compra' as const,
  number: 'F-2026-10',
  issueDate: '2026-10-01',
  dueDate: '2026-10-31',
  base: '1000.00',
  vatRate: '21',
  total: '1210.00',
  lines: [line('Abono NPK', '1000')],
};

describe('facturas (HU-FAC-03)', () => {
  it('queda pendiente con importes exactos', () => {
    const invoice = createInvoice(invoiceInput);
    expect(invoice).toMatchObject({
      paymentStatus: 'pendiente',
      base: 100000n,
      vatRate: 2100n,
      total: 121000n,
    });
  });

  it('Dado un total que no coincide con base más IVA, entonces se rechaza', () => {
    expect(() => createInvoice({ ...invoiceInput, total: '1200.00' })).toThrow(TotalMismatchError);
  });

  it('el vencimiento no es anterior a la emisión', () => {
    expect(() => createInvoice({ ...invoiceInput, dueDate: '2026-09-30' })).toThrow(
      InvalidDocumentError,
    );
  });

  it('una factura sin albaranes puede no llevar líneas (por ejemplo, un servicio)', () => {
    expect(() => createInvoice({ ...invoiceInput, lines: [] })).not.toThrow();
  });
});

describe('agrupar albaranes (RN-FAC-05, RN-FAC-06)', () => {
  const invoice = {
    operation: 'compra' as const,
    thirdPartyId: 'p-1',
    lines: [{ concept: 'X', quantity: 1n, unit: 'kg' }],
  };
  const note = {
    thirdPartyId: 'p-1',
    operation: 'compra' as const,
    status: 'pendiente_facturar' as const,
  };

  it('agrupa albaranes pendientes del mismo tercero y operación', () => {
    expect(() => assertCanGroup(invoice, [note, note])).not.toThrow();
  });

  it.each([
    [{ ...note, thirdPartyId: 'p-2' }, /otro tercero/],
    [{ ...note, operation: 'venta' as const }, /otra operación/],
    [{ ...note, status: 'facturado' as const }, /ya facturado/],
    [{ ...note, status: 'anulado' as const }, /anulado/],
  ])('Dado un albarán %o, cuando intento vincularlo, entonces se rechaza', (bad, message) => {
    expect(() => assertCanGroup(invoice, [note, bad])).toThrow(message);
  });

  it('para conciliar, una factura con albaranes necesita sus líneas', () => {
    expect(() => assertCanGroup({ ...invoice, lines: [] }, [note])).toThrow(/líneas/);
  });
});

describe('pagos, cobros y vencimientos (HU-FAC-07)', () => {
  const pending = { paymentStatus: 'pendiente' as const, dueDate: '2026-10-31', settledAt: null };

  it('RN-FAC-09: pasa a vencida cuando su vencimiento es anterior a hoy', () => {
    expect(markOverdue(pending, '2026-10-31').paymentStatus).toBe('pendiente');
    expect(markOverdue(pending, '2026-11-01').paymentStatus).toBe('vencida');
  });

  it('avisa cuando vence en 3 días', () => {
    expect(isDueSoon(pending, '2026-10-28')).toBe(true);
    expect(isDueSoon(pending, '2026-10-27')).toBe(false);
    expect(isDueSoon({ ...pending, paymentStatus: 'liquidada' }, '2026-10-28')).toBe(false);
  });

  it('se liquida pendiente o vencida, con su fecha', () => {
    expect(settle(pending, '2026-10-15')).toMatchObject({
      paymentStatus: 'liquidada',
      settledAt: '2026-10-15',
    });
    expect(settle({ ...pending, paymentStatus: 'vencida' }, '2026-11-05').paymentStatus).toBe(
      'liquidada',
    );
  });

  it('RN-FAC-10: una liquidada no vuelve a pendiente ni a vencida', () => {
    const settled = settle(pending, '2026-10-15');
    expect(markOverdue(settled, '2027-01-01').paymentStatus).toBe('liquidada');
    expect(() => settle(settled, '2026-10-16')).toThrow(InvalidInvoiceTransitionError);
  });

  it('se anula pendiente o vencida, no liquidada', () => {
    expect(cancelInvoice(pending).paymentStatus).toBe('anulada');
    expect(() => cancelInvoice(settle(pending, '2026-10-15'))).toThrow(
      InvalidInvoiceTransitionError,
    );
  });

  it('suma días a una fecha de calendario, también al cambiar de mes y año', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
