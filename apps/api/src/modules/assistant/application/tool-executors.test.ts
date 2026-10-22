import { describe, expect, it, vi } from 'vitest';

import { availableTools } from '../domain/tool-catalog';
import type { CooperativeContext } from './data-sources';
import { createToolExecutors, InvalidToolInputError, type DataSources } from './tool-executors';

const context = { cooperativeId: 'coop-1', userId: 'u1' } as unknown as CooperativeContext;

function setup() {
  const listThirdParties = vi.fn(async () => [
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
  ]);
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

  it('BR-AI-01: needs member area read', () => {
    const can = (module: string) => module === 'member-area';
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
