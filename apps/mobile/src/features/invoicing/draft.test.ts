import type { ExtractionResponse } from '@multicooperativa/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildDeliveryNoteInput,
  buildInvoiceInput,
  draftFromExtraction,
  emptyDraft,
  setPendingDraft,
  takePendingDraft,
} from './draft';

const PARTY = '40000000-0000-4000-8000-0000000000aa';
const scan = { uri: 'file:///scan.jpg', name: 'scan.jpg', mimeType: 'image/jpeg' } as const;

const extraction = (overrides: Partial<ExtractionResponse> = {}): ExtractionResponse => ({
  status: 'proposal',
  documentType: 'invoice',
  operation: 'purchase',
  thirdParty: { nif: 'B12345674', name: 'Southern Fertilizers', match: null },
  number: 'F-77',
  date: '2026-10-05',
  dueDate: '2026-11-05',
  base: '100.00',
  vatRate: '21',
  total: '121.00',
  lines: [{ concept: 'NPK', quantity: '10', unit: 'kg' }],
  lowConfidence: ['dueDate'],
  ...overrides,
});

describe('US-INV-05 draft from an extraction', () => {
  it('fills the form and keeps the scan and the fields to review', () => {
    const draft = draftFromExtraction(extraction(), scan, 'sale');

    expect(draft).toMatchObject({
      kind: 'invoice',
      operation: 'purchase',
      number: 'F-77',
      total: '121.00',
      lowConfidence: ['dueDate'],
      thirdPartyId: null,
      suggestedParty: { nif: 'B12345674', name: 'Southern Fertilizers' },
    });
    expect(draft.scan).toBe(scan);
  });

  it('preselects the third party of the cooperative when the tax ID matches', () => {
    const match = {
      id: PARTY,
      nif: 'B12345674',
      name: 'Southern Fertilizers',
      isSupplier: true,
      isCustomer: false,
      email: null,
      phone: null,
      active: true,
    };
    const draft = draftFromExtraction(
      extraction({ thirdParty: { nif: 'B12345674', name: 'x', match } }),
      scan,
      'purchase',
    );

    expect(draft.thirdPartyId).toBe(PARTY);
    expect(draft.suggestedParty).toBeNull();
  });

  it('leaves an empty form with the scan attached when nothing could be read', () => {
    const draft = draftFromExtraction(
      extraction({
        status: 'no_data',
        documentType: null,
        operation: null,
        number: null,
        lines: [],
      }),
      scan,
      'sale',
    );

    expect(draft.operation).toBe('sale');
    expect(draft.number).toBe('');
    expect(draft.scan).toBe(scan);
  });

  it('hands the pending draft over once', () => {
    const draft = emptyDraft();
    setPendingDraft(draft);

    expect(takePendingDraft()).toBe(draft);
    expect(takePendingDraft()).toBeNull();
  });
});

describe('US-INV-03 building the invoice record', () => {
  const draft = () => ({
    ...emptyDraft('purchase'),
    thirdPartyId: PARTY,
    number: ' F-1 ',
    date: '2026-10-05',
    dueDate: '2026-11-05',
    base: '1.000,00',
    vatRate: '21',
    total: '',
    lines: [{ concept: 'NPK', quantity: '1250,5', unit: 'kg' }],
  });

  it('normalizes amounts and computes the total when it is left empty', () => {
    expect(buildInvoiceInput(draft())).toMatchObject({
      number: 'F-1',
      base: '1000.00',
      total: '1210.00',
      lines: [{ concept: 'NPK', quantity: '1250.5', unit: 'kg' }],
    });
  });

  it('refuses a missing party, bad date or zero quantity', () => {
    expect(buildInvoiceInput({ ...draft(), thirdPartyId: null })).toBeNull();
    expect(buildInvoiceInput({ ...draft(), dueDate: '5/11/2026' })).toBeNull();
    expect(
      buildInvoiceInput({ ...draft(), lines: [{ concept: 'a', quantity: '0', unit: 'kg' }] }),
    ).toBeNull();
  });

  it('BR-INV-08: grouping delivery notes needs lines', () => {
    expect(buildInvoiceInput({ ...draft(), lines: [], deliveryNoteIds: [PARTY] })).toBeNull();
    expect(buildInvoiceInput({ ...draft(), lines: [] })).not.toBeNull();
  });
});

describe('US-INV-02 building the delivery note record', () => {
  it('needs a party, a number and at least one line', () => {
    const base = {
      ...emptyDraft('sale', 'delivery_note'),
      thirdPartyId: PARTY,
      number: 'A-9',
      date: '2026-10-01',
      lines: [{ concept: 'Oil', quantity: '3', unit: 'l' }],
    };

    expect(buildDeliveryNoteInput(base)).toMatchObject({ operation: 'sale', number: 'A-9' });
    expect(buildDeliveryNoteInput({ ...base, lines: [] })).toBeNull();
    expect(buildDeliveryNoteInput({ ...base, number: ' ' })).toBeNull();
  });
});
