import { describe, expect, it, vi } from 'vitest';

import { availableTools } from '../domain/tool-catalog';
import type { CooperativeContext } from './data-sources';
import { createToolExecutors, InvalidToolInputError, type DataSources } from './tool-executors';

const context = { cooperativeId: 'coop-1', userId: 'u1' } as unknown as CooperativeContext;

function setup() {
  const listThirdParties = vi.fn(async () => ({
    total: 1,
    rows: [
      {
        id: 'tp-1',
        name: 'Olivar Nuevo S.L.',
        nif: 'B98765432',
        supplier: true,
        customer: false,
        active: true,
        createdAt: '2026-10-16',
        email: null,
        phone: '600123123',
      },
    ],
  }));
  const sources = { invoicing: { listThirdParties } } as unknown as DataSources;
  return { listThirdParties, executors: createToolExecutors(sources) };
}

describe('US-AI-02 · list_third_parties', () => {
  it('US-AI-02: passes the filters and the caller context to the invoicing read, with defaults', async () => {
    const { executors, listThirdParties } = setup();

    const output = await executors.list_third_parties(context, {
      type: 'supplier',
      created_from: '2026-10-12',
    });

    expect(listThirdParties).toHaveBeenCalledWith(context, {
      type: 'supplier',
      createdFrom: '2026-10-12',
      createdTo: undefined,
      includeInactive: false,
      inactiveSince: undefined,
      limit: 10,
    });
    expect(output.items).toHaveLength(1);
    expect(output.items[0]!.data).toMatchObject({
      name: 'Olivar Nuevo S.L.',
      createdAt: '2026-10-16',
    });
  });

  it('BR-AI-05: each row is a citable third_party source', async () => {
    const { executors } = setup();

    const output = await executors.list_third_parties(context, {});

    expect(output.items[0]!.source).toMatchObject({
      kind: 'third_party',
      resourceId: 'tp-1',
      title: 'Olivar Nuevo S.L.',
    });
  });

  it('US-AI-02: type "any" means no type filter', async () => {
    const { executors, listThirdParties } = setup();

    await executors.list_third_parties(context, { type: 'any' });

    expect(listThirdParties).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ type: undefined }),
    );
  });

  it.each([
    [{ limit: 51 }],
    [{ limit: 0 }],
    [{ created_from: '12/10/2026' }],
    [{ type: 'member' }],
  ])('BR-AI-06: invalid input %j is rejected so the model can retry', async (input) => {
    const { executors, listThirdParties } = setup();

    await expect(executors.list_third_parties(context, input)).rejects.toBeInstanceOf(
      InvalidToolInputError,
    );
    expect(listThirdParties).not.toHaveBeenCalled();
  });

  it('BR-AI-01: needs invoicing read, like find_third_party', () => {
    const grants = (module: string) => module === 'invoicing';
    const names = availableTools((module) => grants(module)).map((tool) => tool.name);
    expect(names).toContain('list_third_parties');
    expect(
      availableTools((module) => module === 'documents').map((tool) => tool.name),
    ).not.toContain('list_third_parties');
  });
});

describe('US-AI-02 · my_contributions (US-MEM-02)', () => {
  const mine = {
    partnerNumber: '003',
    capital: '500.00',
    latestMovements: [
      { date: '2026-02-10', type: 'refund', concept: 'Partial', capitalChange: '-100.00' },
    ],
  };

  it('BR-AI-02: reads the member area with the caller context and returns the capital as summary', async () => {
    const myContributions = vi.fn(async () => mine);
    const executors = createToolExecutors({
      memberArea: { myContributions },
    } as unknown as DataSources);

    const output = await executors.my_contributions(context, {});

    expect(myContributions).toHaveBeenCalledWith(context, 10);
    expect(output.summary).toMatchObject({ capital: '500.00', partnerNumber: '003' });
    expect(output.items.map((item) => item.data)).toEqual(mine.latestMovements);
    // Movements are not resources the app opens: nothing to cite.
    expect(output.items[0]!.source).toBeUndefined();
  });

  it('BR-AI-03: takes no member id, so it cannot be aimed at another member', async () => {
    const myContributions = vi.fn(async () => mine);
    const executors = createToolExecutors({
      memberArea: { myContributions },
    } as unknown as DataSources);

    await executors.my_contributions(context, { n: 3, membership_id: 'someone-else' });

    expect(myContributions).toHaveBeenCalledWith(context, 3);
  });

  it('BR-AI-01: needs member area read, even with "own" scope only', () => {
    const can = (module: string, _level: string, scope?: 'all') =>
      module === 'member-area' && scope !== 'all';
    expect(availableTools(can).map((tool) => tool.name)).toEqual(['my_contributions']);
  });
});

describe('US-AI-02 · search_documents with neighbour context (ADR-023)', () => {
  it('gives the model the expanded context but cites the fragment itself', async () => {
    const hit = {
      documentId: 'd1',
      versionId: 'v1',
      title: 'Bylaws',
      category: 'bylaws',
      page: 3,
      position: 4,
      content: 'Artículo 5. Corto.',
      context: 'Artículo 5. Corto.\n\nArtículo 6. Sigue.',
      score: 0.7,
    };
    const executors = createToolExecutors({
      documents: { search: async () => [hit] },
    } as unknown as DataSources);

    const { items } = await executors.search_documents(context, { query: 'artículo cinco' });

    expect(items[0]?.data.text).toBe(hit.context);
    expect(items[0]?.source).toMatchObject({ page: 3, excerpt: 'Artículo 5. Corto.' });
  });
});

describe('US-AI-09 · the cooperative-wide member tools (ADR-025)', () => {
  const memberArea = {
    capitalSummary: vi.fn(async () => ({
      totalCapital: '12400.00',
      partners: 24,
      period: {
        from: '2026-01-01',
        to: null,
        contributions: '10.00',
        refunds: '5.00',
        corrections: '0.00',
      },
    })),
    census: vi.fn(async () => ({
      activePartners: 22,
      suspendedPartners: 1,
      invitedNotActivated: 2,
      joinedInPeriod: 3,
      leftInPeriod: 1,
      period: { from: '2026-01-01', to: null },
    })),
    memberDetail: vi.fn(async () => [
      { name: 'Luis', partnerNumber: '012', nif: '12345678Z', capital: '1800.00' },
    ]),
    partnersWithNif: vi.fn(async () => [
      { name: 'Luis', partnerNumber: '012', nif: '12345678Z' },
      { name: 'Eva', partnerNumber: '013', nif: 'X1234567L' },
    ]),
  };
  const tradeByNif = vi.fn(async () => [
    {
      nif: '12345678Z',
      name: 'Luis Martín',
      supplier: true,
      customer: false,
      purchases: { total: '1000.10', count: 2 },
      sales: { total: '0.00', count: 0 },
    },
    {
      nif: 'X1234567L',
      name: 'Eva SL',
      supplier: true,
      customer: true,
      purchases: { total: '0.20', count: 1 },
      sales: { total: '50.00', count: 1 },
    },
  ]);
  const executors = createToolExecutors({
    memberArea,
    invoicing: { tradeByNif },
  } as unknown as DataSources);

  it('BR-AI-02: capital_summary passes the period and the caller context, and flattens the summary', async () => {
    const output = await executors.capital_summary(context, { from: '2026-01-01' });

    expect(memberArea.capitalSummary).toHaveBeenCalledWith(context, { from: '2026-01-01' });
    expect(output.items).toEqual([]);
    expect(output.summary).toMatchObject({
      totalCapital: '12400.00',
      partners: 24,
      refunds: '5.00',
    });
  });

  it('BR-AI-02: member_census passes the period', async () => {
    const output = await executors.member_census(context, { from: '2026-01-01', to: '2026-12-31' });

    expect(memberArea.census).toHaveBeenCalledWith(context, {
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(output.summary).toMatchObject({ activePartners: 22, invitedNotActivated: 2 });
  });

  it('BR-AI-03: member_detail looks up by text, returns one item per match and cites nothing', async () => {
    const output = await executors.member_detail(context, { query: ' Luis ' });

    expect(memberArea.memberDetail).toHaveBeenCalledWith(context, 'Luis', 10);
    expect(output.items).toHaveLength(1);
    expect(output.items[0]!.data).toMatchObject({ nif: '12345678Z', capital: '1800.00' });
    expect(output.items[0]!.source).toBeUndefined();
  });

  it('BR-AI-06: member_detail needs a query', async () => {
    await expect(executors.member_detail(context, {})).rejects.toBeInstanceOf(
      InvalidToolInputError,
    );
  });

  it('BR-AI-02 (ADR-025): partner_trade crosses the partners NIFs with invoicing, and totals are exact decimals', async () => {
    const output = await executors.partner_trade(context, { from: '2026-01-01', to: '2026-12-31' });

    expect(tradeByNif).toHaveBeenCalledWith(context, ['12345678Z', 'X1234567L'], {
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(output.items.map((item) => item.data.partner)).toEqual(['Luis', 'Eva']);
    // 1000.10 + 0.20 must be 1000.30, not 1000.3000000000001.
    expect(output.summary).toMatchObject({
      partnersWithNif: 2,
      partnersAlsoThirdParties: 2,
      purchasesTotal: '1000.30',
      salesTotal: '50.00',
    });
  });

  it('ADR-025: with no partner NIF it does not even ask invoicing', async () => {
    tradeByNif.mockClear();
    const none = createToolExecutors({
      memberArea: { partnersWithNif: async () => [] },
      invoicing: { tradeByNif },
    } as unknown as DataSources);

    const output = await none.partner_trade(context, {});

    expect(tradeByNif).not.toHaveBeenCalled();
    expect(output.items).toEqual([]);
    expect(output.summary).toMatchObject({ partnersWithNif: 0, purchasesTotal: '0.00' });
  });

  it('BR-AI-01: partner_trade needs member area "all" and invoicing; the others only the member area', () => {
    const grants = (modules: string[], scope?: 'all') => (module: string, _l: string, s?: 'all') =>
      modules.includes(module) && (s === undefined || s === scope);
    const names = (can: ReturnType<typeof grants>) => availableTools(can).map((tool) => tool.name);

    expect(names(grants(['member-area'], 'all'))).toEqual([
      'my_contributions',
      'capital_summary',
      'member_census',
      'member_detail',
    ]);
    expect(names(grants(['member-area', 'invoicing'], 'all'))).toContain('partner_trade');
    expect(names(grants(['member-area', 'invoicing'], undefined))).toEqual(
      expect.not.arrayContaining(['capital_summary', 'partner_trade']),
    );
  });
});

describe('US-AI-08 · invoicing analytics tools', () => {
  const invoicingTools = [
    'invoice_totals',
    'invoice_detail',
    'open_discrepancies',
    'cash_forecast',
    'top_items',
    'third_party_summary',
  ];
  const totals = { count: 2, base: '200.00', vatAmount: '42.00', total: '242.00' };
  const detail = {
    id: 'inv-1',
    operation: 'purchase',
    number: 'F-80',
    thirdParty: 'Agrotools',
    total: '300.00',
    lines: [],
    deliveryNotes: [{ number: 'A-0', date: '2026-09-20' }],
    discrepancies: [
      {
        concept: 'Herramientas',
        unit: 'ud',
        deliveredQuantity: '1200',
        invoicedQuantity: '1250',
        difference: '50',
        explanation: 'Se facturaron 50 de más.',
      },
    ],
  };
  const invoicing = {
    invoices: vi.fn(async () => ({
      rows: [{ id: 'i1', number: 'F-1', thirdParty: 'X' }],
      total: 40,
    })),
    invoiceTotals: vi.fn(async () => ({
      overall: totals,
      groups: [{ key: 'tp-1', label: 'Southern', ...totals }],
      groupCount: 7,
    })),
    invoiceDetail: vi.fn(async () => ({ rows: [detail], total: 1 })),
    thirdPartySummary: vi.fn(async () => ({
      candidates: [
        { id: 'tp-1', name: 'Agro Sur', nif: 'B1', supplier: true, customer: false },
        { id: 'tp-2', name: 'Agro Norte', nif: 'B2', supplier: true, customer: false },
      ],
      summary: null,
    })),
    topItems: vi.fn(async () => ({
      rows: [{ concept: 'Aceite', unit: 'l', quantity: '800', lines: 3 }],
      total: 1,
      truncated: false,
    })),
  };
  const executors = createToolExecutors({ invoicing } as unknown as DataSources);

  it('US-AI-08: a list says how many matched and asks to say "muestro X de N" when it is cut', async () => {
    const output = await executors.list_invoices(context, { settled_from: '2026-09-01' });

    expect(invoicing.invoices).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ settledFrom: '2026-09-01', settledTo: undefined }),
    );
    expect(output.summary).toMatchObject({ total: 40, truncated: true });
    expect(String(output.summary?.note)).toContain('muestro 1 de 40');
  });

  it('US-AI-08: a complete list carries no cut note', async () => {
    invoicing.invoices.mockResolvedValueOnce({ rows: [], total: 0 });

    const output = await executors.list_invoices(context, {});

    expect(output.summary).toEqual({ total: 0, truncated: false });
  });

  it('US-AI-08: invoice_totals ranks third parties (citable) with the overall figures', async () => {
    const output = await executors.invoice_totals(context, {
      operation: 'purchase',
      from: '2026-01-01',
      to: '2026-12-31',
      group_by: 'third_party',
      limit: 5,
    });

    expect(invoicing.invoiceTotals).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ operation: 'purchase', groupBy: 'third_party', limit: 5 }),
    );
    expect(output.items[0]).toMatchObject({
      data: { thirdParty: 'Southern', total: '242.00' },
      source: { kind: 'third_party', resourceId: 'tp-1' },
    });
    expect(output.summary).toMatchObject({ overall: totals, total: 7, truncated: true });
  });

  it('US-AI-08: invoice_totals defaults to one total with no grouping', async () => {
    await executors.invoice_totals(context, {});

    expect(invoicing.invoiceTotals).toHaveBeenLastCalledWith(
      context,
      expect.objectContaining({ groupBy: 'none', limit: 10 }),
    );
  });

  it.each([
    ['invoice_totals', { group_by: 'year' }],
    ['invoice_totals', { limit: 26 }],
    ['invoice_detail', {}],
    ['cash_forecast', { group_by: 'day' }],
    ['top_items', { source: 'orders' }],
    ['third_party_summary', { text: 'a' }],
  ])(
    'BR-AI-06: invalid input for %s %j is rejected so the model can retry',
    async (tool, input) => {
      await expect(
        (executors as unknown as Record<string, (c: unknown, i: unknown) => Promise<unknown>>)[
          tool
        ]!(context, input),
      ).rejects.toBeInstanceOf(InvalidToolInputError);
    },
  );

  it('BR-INV-12: invoice_detail gives the numeric differences first and flags the explanation as indicative', async () => {
    const output = await executors.invoice_detail(context, { number: 'F-80' });
    const data = output.items[0]!.data as {
      discrepancies: Record<string, unknown>[];
      explanationNote: string;
    };

    expect(Object.keys(data.discrepancies[0]!)).toEqual([
      'concept',
      'unit',
      'deliveredQuantity',
      'invoicedQuantity',
      'difference',
      'explanation',
    ]);
    expect(data.explanationNote).toContain('numeric detail governs');
    expect(output.items[0]!.source).toMatchObject({ kind: 'invoice', resourceId: 'inv-1' });
  });

  it('US-AI-08: third_party_summary with several matches lists them and asks the model to ask', async () => {
    const output = await executors.third_party_summary(context, { text: 'agro' });

    expect(output.items.map((item) => item.data.name)).toEqual(['Agro Sur', 'Agro Norte']);
    expect(String(output.summary?.note)).toContain('ask which one');
  });

  it('US-AI-08: top_items defaults to delivery notes, no grouping and 10 items', async () => {
    await executors.top_items(context, { concept: 'aceite' });

    expect(invoicing.topItems).toHaveBeenCalledWith(context, {
      source: 'delivery_notes',
      operation: undefined,
      from: undefined,
      to: undefined,
      concept: 'aceite',
      groupBy: 'none',
      limit: 10,
    });
  });

  it('BR-AI-01: every analytic tool needs invoicing read; a member without it does not see them', () => {
    const withInvoicing = availableTools((module) => module === 'invoicing').map((t) => t.name);
    const withoutInvoicing = availableTools((module) => module !== 'invoicing').map((t) => t.name);

    expect(withInvoicing).toEqual(expect.arrayContaining(invoicingTools));
    for (const tool of invoicingTools) expect(withoutInvoicing).not.toContain(tool);
  });
});
