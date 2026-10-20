import { describe, expect, it } from 'vitest';

import type { CooperativeContext } from '../../access';
import { InvalidDocumentError } from '../domain/errors';
import { extractDocument, type ExtractionDeps } from './extraction';
import type { RawExtraction } from './ports/document-extractor';
import type { ThirdPartyRecord, ThirdPartyStore } from './ports/third-party-store';

const COOP = '40000000-0000-4000-8000-000000000001';
const OTHER = '40000000-0000-4000-8000-000000000002';
const PDF = new TextEncoder().encode('%PDF-1.4 invoice');

const context = (level: 'read' | 'manage' = 'manage'): CooperativeContext => ({
  userId: 'u',
  sessionId: 's',
  cooperativeId: COOP,
  membershipId: 'm',
  profileName: 'Gestor',
  isPartner: false,
  permissions: [{ module: 'invoicing', level, scope: 'all' }],
});

const party = (cooperativeId: string, nif: string, name: string): ThirdPartyRecord => ({
  id: `${cooperativeId}-${nif}`,
  cooperativeId,
  nif,
  name,
  isSupplier: true,
  isCustomer: true,
  email: null,
  phone: null,
  active: true,
  createdAt: new Date(),
});

const parties = [
  party(COOP, 'B12345674', 'Southern Fertilizers'),
  party(OTHER, 'A58818501', 'Other cooperative diesel'),
];
const store = {
  findByNif: async (cooperativeId: string, nif: string) =>
    parties.find((p) => p.cooperativeId === cooperativeId && p.nif === nif) ?? null,
} as unknown as ThirdPartyStore;

const raw = (overrides: Partial<RawExtraction> = {}): RawExtraction => ({
  documentType: 'invoice',
  issuer: { nif: 'B-12345674', name: 'SOUTHERN FERTILIZERS LTD' },
  recipient: { nif: 'F12345674', name: 'Farm Cooperative' },
  number: ' F-2026-17 ',
  date: '2026-10-05',
  dueDate: '2026-11-05',
  base: '1.000,00 €',
  vatRate: '21 %',
  total: '1.210,00',
  lines: [{ concept: 'Fertilizer NPK', quantity: '1.000', unit: 'kg' }],
  lowConfidence: [],
  ...overrides,
});

const deps = (extraction: RawExtraction | null): ExtractionDeps => ({
  extractor: { extract: async () => extraction },
  thirdParties: store,
  cooperativeTaxId: async () => 'F12345674',
});

describe('vision extraction (US-INV-05)', () => {
  it('proposes a purchase with the supplier preselected and the amounts normalized', async () => {
    const proposal = await extractDocument(deps(raw()), context(), { content: PDF });

    expect(proposal).toMatchObject({
      status: 'proposal',
      documentType: 'invoice',
      operation: 'purchase',
      thirdParty: {
        nif: 'B12345674',
        name: 'Southern Fertilizers',
        match: { id: `${COOP}-B12345674` },
      },
      number: 'F-2026-17',
      base: '1000.00',
      vatRate: '21',
      total: '1210.00',
      lines: [{ concept: 'Fertilizer NPK', quantity: '1000', unit: 'kg' }],
      lowConfidence: [],
    });
  });

  it('if the cooperative itself issues it, it is a sale and the third party is the recipient', async () => {
    const proposal = await extractDocument(
      deps(
        raw({
          issuer: { nif: 'F12345674', name: 'Cooperative' },
          recipient: { nif: '12345678Z', name: 'Eastern Oil Mill' },
        }),
      ),
      context(),
      { content: PDF },
    );

    expect(proposal).toMatchObject({
      operation: 'sale',
      thirdParty: { nif: '12345678Z', name: 'Eastern Oil Mill', match: null },
    });
  });

  it('never resolves a third party of another cooperative even if the NIF matches (requirements/05, section 10)', async () => {
    const proposal = await extractDocument(
      deps(raw({ issuer: { nif: 'A58818501', name: 'Diesel Co' } })),
      context(),
      { content: PDF },
    );

    expect(proposal.thirdParty).toEqual({ nif: 'A58818501', name: 'Diesel Co', match: null });
  });

  it('what fails the manual-entry validation is left empty and flagged for review', async () => {
    const proposal = await extractDocument(
      deps(
        raw({
          total: 'one thousand two hundred',
          date: '31/02/2026',
          lines: [{ concept: 'X', quantity: '0', unit: 'kg' }],
          lowConfidence: ['number'],
        }),
      ),
      context(),
      { content: PDF },
    );

    expect(proposal).toMatchObject({ total: null, date: null, lines: [] });
    expect(proposal.lowConfidence.sort()).toEqual(['date', 'lines', 'number', 'total']);
  });

  it('an unreadable NIF or one with a misread digit is flagged for review', async () => {
    const proposal = await extractDocument(
      deps(raw({ issuer: { nif: 'B12345675', name: 'Fertilizers' } })),
      context(),
      { content: PDF },
    );

    expect(proposal.thirdParty.match).toBeNull();
    expect(proposal.lowConfidence).toContain('thirdParty');
  });

  it('Given that the model cannot extract data, then it is reported and the form can be filled in by hand', async () => {
    expect((await extractDocument(deps(null), context(), { content: PDF })).status).toBe('no_data');
    expect(
      (await extractDocument(deps(raw({ documentType: 'other' })), context(), { content: PDF }))
        .status,
    ).toBe('no_data');
  });

  it('only accepts photos or PDFs and requires manage access', async () => {
    await expect(
      extractDocument(deps(raw()), context(), { content: new TextEncoder().encode('<html>') }),
    ).rejects.toThrow(InvalidDocumentError);
    await expect(
      extractDocument(deps(raw()), context('read'), { content: PDF }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
