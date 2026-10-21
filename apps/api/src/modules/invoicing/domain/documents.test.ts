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
  assertDueSoonDays,
  DEFAULT_DUE_SOON_DAYS,
  deactivate,
  invoiceNeedsAttention,
  isDueSoon,
  noteNeedsAttention,
  staleNoteCutoff,
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
  name: ' Southern Fertilizers SL ',
  isSupplier: true,
  isCustomer: false,
  email: null,
  phone: null,
});
const customer = createThirdParty({
  nif: '12345678Z',
  name: 'Northern Oil Mill',
  isSupplier: false,
  isCustomer: true,
  email: 'compras@norte.es',
  phone: null,
});

describe('third parties (US-INV-01)', () => {
  it('normalizes the NIF and the name', () => {
    expect(supplier).toMatchObject({
      nif: 'B12345674',
      name: 'Southern Fertilizers SL',
      active: true,
    });
  });

  it('rejects a NIF with an incorrect check digit (NFR-INV-06)', () => {
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

  it('must be a supplier, a customer or both', () => {
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

  it('BR-INV-03: a purchase delivery note only admits suppliers and a sale one only customers', () => {
    expect(() => assertCanOperate(supplier, 'purchase')).not.toThrow();
    expect(() => assertCanOperate(supplier, 'sale')).toThrow(/customer/);
    expect(() => assertCanOperate(customer, 'purchase')).toThrow(/supplier/);
  });

  it('BR-INV-14: a deactivated third party is no longer offered for new records', () => {
    expect(() => assertCanOperate(deactivate(supplier), 'purchase')).toThrow(/deactivated/);
  });
});

const line = (concept: string, quantity: string, unit = 'kg') => ({ concept, quantity, unit });

describe('delivery notes (US-INV-02)', () => {
  it('is pending invoicing with its lines', () => {
    const note = createDeliveryNote({
      operation: 'purchase',
      number: ' A-001 ',
      date: '2026-10-01',
      lines: [line('Fertilizer NPK', '1250.5')],
    });

    expect(note).toMatchObject({ status: 'pending_invoicing', number: 'A-001' });
    expect(note.lines).toEqual([{ concept: 'Fertilizer NPK', quantity: 1250500n, unit: 'kg' }]);
  });

  it('Given a line with zero or negative quantity, then it is rejected', () => {
    for (const quantity of ['0', '-1']) {
      expect(() =>
        createDeliveryNote({
          operation: 'purchase',
          number: 'A-1',
          date: '2026-10-01',
          lines: [line('X', quantity)],
        }),
      ).toThrow(InvalidDocumentError);
    }
  });

  it('needs at least one line with concept and unit', () => {
    expect(() =>
      createDeliveryNote({ operation: 'purchase', number: 'A-1', date: '2026-10-01', lines: [] }),
    ).toThrow(InvalidDocumentError);
    expect(() =>
      createDeliveryNote({
        operation: 'purchase',
        number: 'A-1',
        date: '2026-10-01',
        lines: [line(' ', '1')],
      }),
    ).toThrow(InvalidDocumentError);
  });

  it('can be voided only while pending invoicing', () => {
    const note = createDeliveryNote({
      operation: 'purchase',
      number: 'A-1',
      date: '2026-10-01',
      lines: [line('X', '1')],
    });
    expect(cancelDeliveryNote(note).status).toBe('voided');
    expect(() => cancelDeliveryNote({ ...note, status: 'invoiced' })).toThrow(
      InvalidInvoiceTransitionError,
    );
  });
});

const invoiceInput = {
  operation: 'purchase' as const,
  number: 'F-2026-10',
  issueDate: '2026-10-01',
  dueDate: '2026-10-31',
  base: '1000.00',
  vatRate: '21',
  total: '1210.00',
  lines: [line('Fertilizer NPK', '1000')],
};

describe('invoices (US-INV-03)', () => {
  it('is pending with exact amounts', () => {
    const invoice = createInvoice(invoiceInput);
    expect(invoice).toMatchObject({
      paymentStatus: 'pending',
      base: 100000n,
      vatRate: 2100n,
      total: 121000n,
    });
  });

  it('Given a total that does not match base plus VAT, then it is rejected', () => {
    expect(() => createInvoice({ ...invoiceInput, total: '1200.00' })).toThrow(TotalMismatchError);
  });

  it('the due date is not earlier than the issue date', () => {
    expect(() => createInvoice({ ...invoiceInput, dueDate: '2026-09-30' })).toThrow(
      InvalidDocumentError,
    );
  });

  it('an invoice without delivery notes may have no lines (for example, a service)', () => {
    expect(() => createInvoice({ ...invoiceInput, lines: [] })).not.toThrow();
  });
});

describe('grouping delivery notes (BR-INV-05, BR-INV-06)', () => {
  const invoice = {
    operation: 'purchase' as const,
    thirdPartyId: 'p-1',
    lines: [{ concept: 'X', quantity: 1n, unit: 'kg' }],
  };
  const note = {
    thirdPartyId: 'p-1',
    operation: 'purchase' as const,
    status: 'pending_invoicing' as const,
  };

  it('groups pending delivery notes of the same third party and operation', () => {
    expect(() => assertCanGroup(invoice, [note, note])).not.toThrow();
  });

  it.each([
    [{ ...note, thirdPartyId: 'p-2' }, /another third party/],
    [{ ...note, operation: 'sale' as const }, /another operation/],
    [{ ...note, status: 'invoiced' as const }, /already invoiced/],
    [{ ...note, status: 'voided' as const }, /voided/],
  ])('Given a delivery note %o, when I try to link it, then it is rejected', (bad, message) => {
    expect(() => assertCanGroup(invoice, [note, bad])).toThrow(message);
  });

  it('to reconcile, an invoice with delivery notes needs its lines', () => {
    expect(() => assertCanGroup({ ...invoice, lines: [] }, [note])).toThrow(/lines/);
  });
});

describe('payments, collections and due dates (US-INV-07)', () => {
  const pending = { paymentStatus: 'pending' as const, dueDate: '2026-10-31', settledAt: null };

  it('BR-INV-09: becomes overdue when its due date is before today', () => {
    expect(markOverdue(pending, '2026-10-31').paymentStatus).toBe('pending');
    expect(markOverdue(pending, '2026-11-01').paymentStatus).toBe('overdue');
  });

  it('warns when due within the next N days, also if the process did not run one day', () => {
    expect(isDueSoon(pending, '2026-10-28', 3)).toBe(true);
    expect(isDueSoon(pending, '2026-10-30', 3)).toBe(true);
    expect(isDueSoon(pending, '2026-10-31', 3)).toBe(true);
    expect(isDueSoon(pending, '2026-10-27', 3)).toBe(false);
    expect(isDueSoon(pending, '2026-11-01', 3)).toBe(false);
    expect(isDueSoon({ ...pending, paymentStatus: 'settled' }, '2026-10-28', 3)).toBe(false);
  });

  it('BR-INV-15: the window is the cooperative own number of days', () => {
    expect(isDueSoon(pending, '2026-10-16', DEFAULT_DUE_SOON_DAYS)).toBe(true);
    expect(isDueSoon(pending, '2026-10-15', DEFAULT_DUE_SOON_DAYS)).toBe(false);
    expect(isDueSoon(pending, '2026-10-01', 30)).toBe(true);
    expect(isDueSoon(pending, '2026-08-02', 90)).toBe(true);
    expect(isDueSoon(pending, '2026-08-01', 90)).toBe(false);
  });

  it('is settled when pending or overdue, with its date', () => {
    expect(settle(pending, '2026-10-15')).toMatchObject({
      paymentStatus: 'settled',
      settledAt: '2026-10-15',
    });
    expect(settle({ ...pending, paymentStatus: 'overdue' }, '2026-11-05').paymentStatus).toBe(
      'settled',
    );
  });

  it('BR-INV-10: a settled one does not go back to pending or overdue', () => {
    const settled = settle(pending, '2026-10-15');
    expect(markOverdue(settled, '2027-01-01').paymentStatus).toBe('settled');
    expect(() => settle(settled, '2026-10-16')).toThrow(InvalidInvoiceTransitionError);
  });

  it('is voided when pending or overdue, not settled', () => {
    expect(cancelInvoice(pending).paymentStatus).toBe('voided');
    expect(() => cancelInvoice(settle(pending, '2026-10-15'))).toThrow(
      InvalidInvoiceTransitionError,
    );
  });

  it('adds days to a calendar date, also across month and year changes', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('the field of a rule violation (usability of forms: details.field)', () => {
  const field = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      return (error as { field?: string }).field;
    }
    return 'no error';
  };
  const invoice = {
    operation: 'purchase' as const,
    number: 'F-1',
    issueDate: '2026-05-10',
    dueDate: '2026-06-10',
    base: '100.00',
    vatRate: '21',
    total: '121.00',
    lines: [],
  };

  it('names the NIF, the name and the roles of a third party', () => {
    const party = { isSupplier: true, isCustomer: false, email: null, phone: null };
    expect(field(() => createThirdParty({ ...party, nif: 'X', name: 'A' }))).toBe('nif');
    expect(field(() => createThirdParty({ ...party, nif: '12345678Z', name: ' ' }))).toBe('name');
    expect(
      field(() => createThirdParty({ ...party, nif: '12345678Z', name: 'A', isSupplier: false })),
    ).toBe('roles');
    expect(
      field(() => createThirdParty({ ...party, nif: '12345678Z', name: 'A', email: 'nope' })),
    ).toBe('email');
  });

  it('names the date, amount and number fields of an invoice', () => {
    expect(field(() => createInvoice({ ...invoice, dueDate: '2026-05-01' }))).toBe('dueDate');
    expect(field(() => createInvoice({ ...invoice, issueDate: 'x' }))).toBe('issueDate');
    expect(field(() => createInvoice({ ...invoice, base: 'abc' }))).toBe('base');
    expect(field(() => createInvoice({ ...invoice, vatRate: '150' }))).toBe('vatRate');
    expect(field(() => createInvoice({ ...invoice, number: ' ' }))).toBe('number');
  });

  it('names the line and the column of a bad line', () => {
    const lines = [
      { concept: 'Oil', quantity: '1', unit: 'kg' },
      { concept: '', quantity: '1', unit: 'kg' },
    ];
    expect(field(() => createInvoice({ ...invoice, lines }))).toBe('lines.1.concept');
    expect(
      field(() =>
        createDeliveryNote({
          operation: 'purchase',
          number: 'A',
          date: '2026-05-10',
          lines: [{ concept: 'a', quantity: '0', unit: 'kg' }],
        }),
      ),
    ).toBe('lines.0.quantity');
  });
});

describe('notice days and attention (BR-INV-15, BR-INV-16)', () => {
  it('BR-INV-15: defaults to 15 days and accepts whole numbers from 1 to 90', () => {
    expect(DEFAULT_DUE_SOON_DAYS).toBe(15);
    expect(assertDueSoonDays(1)).toBe(1);
    expect(assertDueSoonDays(90)).toBe(90);
    for (const bad of [0, 91, -3, 1.5, Number.NaN]) {
      expect(() => assertDueSoonDays(bad)).toThrow(InvalidDocumentError);
    }
    expect(() => assertDueSoonDays(0)).toThrow(expect.objectContaining({ field: 'dueSoonDays' }));
  });

  describe('invoices', () => {
    const today = '2026-10-21';
    const invoiceDue = (
      dueDate: string,
      paymentStatus: 'pending' | 'overdue' | 'settled' | 'voided' = 'pending',
    ) => ({
      paymentStatus,
      dueDate,
    });

    it('counts the overdue ones and those due up to N days from today, edges included', () => {
      expect(invoiceNeedsAttention(invoiceDue('2026-10-20'), today, 15)).toBe(true);
      expect(invoiceNeedsAttention(invoiceDue('2026-10-21'), today, 15)).toBe(true);
      expect(invoiceNeedsAttention(invoiceDue('2026-11-05'), today, 15)).toBe(true);
      expect(invoiceNeedsAttention(invoiceDue('2026-11-06'), today, 15)).toBe(false);
      expect(invoiceNeedsAttention(invoiceDue('2026-10-22'), today, 1)).toBe(true);
      expect(invoiceNeedsAttention(invoiceDue('2026-10-23'), today, 1)).toBe(false);
    });

    it('counts a long-overdue invoice whatever N is, and an overdue status', () => {
      expect(invoiceNeedsAttention(invoiceDue('2025-01-01', 'overdue'), today, 1)).toBe(true);
    });

    it('never counts a settled or voided invoice', () => {
      expect(invoiceNeedsAttention(invoiceDue('2026-10-01', 'settled'), today, 15)).toBe(false);
      expect(invoiceNeedsAttention(invoiceDue('2026-10-01', 'voided'), today, 15)).toBe(false);
    });

    it('crosses month and year ends exactly', () => {
      expect(invoiceNeedsAttention(invoiceDue('2027-01-14'), '2026-12-30', 15)).toBe(true);
      expect(invoiceNeedsAttention(invoiceDue('2027-01-15'), '2026-12-30', 15)).toBe(false);
      expect(invoiceNeedsAttention(invoiceDue('2028-02-29'), '2028-02-14', 15)).toBe(true);
    });
  });

  describe('delivery notes (US-INV-09)', () => {
    const today = '2026-10-21';

    it('the cut-off is today minus (30 - N): the date a note turns 30 days old within N days', () => {
      expect(staleNoteCutoff(today, 15)).toBe('2026-10-06');
      expect(staleNoteCutoff(today, 1)).toBe('2026-09-22');
      expect(staleNoteCutoff(today, 29)).toBe('2026-10-20');
    });

    it('with N of 30 or more every pending note counts: there is no cut-off', () => {
      expect(staleNoteCutoff(today, 30)).toBeNull();
      expect(staleNoteCutoff(today, 90)).toBeNull();
    });

    it('counts old notes and those reaching 30 days within N days, edges included', () => {
      const pendingOn = (date: string) => ({ status: 'pending_invoicing' as const, date });
      // 2026-10-06 is 15 days old: it reaches 30 days in exactly 15 days.
      expect(noteNeedsAttention(pendingOn('2026-10-06'), today, 15)).toBe(true);
      expect(noteNeedsAttention(pendingOn('2026-10-07'), today, 15)).toBe(false);
      expect(noteNeedsAttention(pendingOn('2026-08-01'), today, 15)).toBe(true);
    });

    it('with N of 30 or more counts even a note dated today or later', () => {
      const pendingOn = (date: string) => ({ status: 'pending_invoicing' as const, date });
      expect(noteNeedsAttention(pendingOn(today), today, 30)).toBe(true);
      expect(noteNeedsAttention(pendingOn('2026-10-25'), today, 45)).toBe(true);
      expect(noteNeedsAttention(pendingOn(today), today, 29)).toBe(false);
    });

    it('never counts an invoiced or voided note', () => {
      expect(noteNeedsAttention({ status: 'invoiced', date: '2026-01-01' }, today, 15)).toBe(false);
      expect(noteNeedsAttention({ status: 'voided', date: '2026-01-01' }, today, 90)).toBe(false);
    });
  });
});
