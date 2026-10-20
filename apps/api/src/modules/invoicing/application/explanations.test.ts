import { describe, expect, it, vi } from 'vitest';

import type { CooperativeContext } from '../../access';
import { explainDiscrepancies } from './explanations';
import type { DiscrepancyRecord, InvoiceRecord, InvoiceStore } from './ports/document-stores';

const COOP = '40000000-0000-4000-8000-000000000001';
const INVOICE = '40000000-0000-4000-8000-0000000000aa';

const context = (level: 'read' | 'manage' | null = 'read'): CooperativeContext => ({
  userId: 'u',
  sessionId: 's',
  cooperativeId: COOP,
  membershipId: 'm',
  profileName: 'Consejo rector',
  isPartner: true,
  permissions: level ? [{ module: 'invoicing', level, scope: 'all' }] : [],
});

const discrepancy = (id: string, explanation: string | null): DiscrepancyRecord => ({
  id,
  concept: 'fertilizer npk',
  unit: 'kg',
  deliveredQuantity: 1000_000n,
  invoicedQuantity: 1200_000n,
  explanation,
});

function setup(discrepancies: DiscrepancyRecord[]) {
  let stored = discrepancies;
  const saveExplanations = vi.fn(
    async (_c: string, _i: string, drafts: { id: string; text: string }[]) => {
      stored = stored.map((d) => ({
        ...d,
        explanation: drafts.find((x) => x.id === d.id)?.text ?? d.explanation,
      }));
    },
  );
  const invoices = {
    find: async (cooperativeId: string, id: string) =>
      cooperativeId === COOP && id === INVOICE
        ? ({ id, cooperativeId, discrepancies: stored } as unknown as InvoiceRecord)
        : null,
    saveExplanations,
  } as unknown as InvoiceStore;
  return { invoices, saveExplanations };
}

describe('AI explanation of discrepancies (US-INV-04, BR-INV-12)', () => {
  it('stores the drafted text next to the numeric detail and sends only concept, unit and quantities', async () => {
    const { invoices, saveExplanations } = setup([discrepancy('d1', null)]);
    const explain = vi.fn(async () => ['Billed 200 kg more than delivered.']);

    const result = await explainDiscrepancies(
      { invoices, explainer: { explain } },
      context(),
      INVOICE,
    );

    expect(explain).toHaveBeenCalledWith([
      {
        concept: 'fertilizer npk',
        unit: 'kg',
        deliveredQuantity: '1000',
        invoicedQuantity: '1200',
      },
    ]);
    expect(saveExplanations).toHaveBeenCalledWith(COOP, INVOICE, [
      { id: 'd1', text: 'Billed 200 kg more than delivered.' },
    ]);
    expect(result.discrepancies[0]?.explanation).toBe('Billed 200 kg more than delivered.');
  });

  it('does not ask again for what already has an explanation', async () => {
    const { invoices } = setup([discrepancy('d1', 'Already there')]);
    const explain = vi.fn(async () => ['x']);

    await explainDiscrepancies({ invoices, explainer: { explain } }, context(), INVOICE);

    expect(explain).not.toHaveBeenCalled();
  });

  it('leaves the explanation empty when the model fails or answers the wrong number of texts', async () => {
    const failing = setup([discrepancy('d1', null)]);
    const result = await explainDiscrepancies(
      {
        invoices: failing.invoices,
        explainer: {
          explain: async () => {
            throw new Error('down');
          },
        },
      },
      context(),
      INVOICE,
    );
    expect(result.discrepancies[0]?.explanation).toBeNull();

    const mismatch = setup([discrepancy('d1', null), discrepancy('d2', null)]);
    await explainDiscrepancies(
      { invoices: mismatch.invoices, explainer: { explain: async () => ['only one'] } },
      context(),
      INVOICE,
    );
    expect(mismatch.saveExplanations).not.toHaveBeenCalled();
  });

  it('denies without access to the module and answers not found for another cooperative or id', async () => {
    const { invoices } = setup([discrepancy('d1', null)]);
    const explainer = { explain: async () => ['x'] };

    await expect(
      explainDiscrepancies({ invoices, explainer }, context(null), INVOICE),
    ).rejects.toThrow();
    await expect(
      explainDiscrepancies(
        { invoices, explainer },
        { ...context(), cooperativeId: 'other' },
        INVOICE,
      ),
    ).rejects.toThrow(/not found/i);
    await expect(
      explainDiscrepancies({ invoices, explainer }, context(), 'not-a-uuid'),
    ).rejects.toThrow();
  });
});
