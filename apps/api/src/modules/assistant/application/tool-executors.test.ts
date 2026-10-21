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
