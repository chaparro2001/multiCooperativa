import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../test/database';
import type { CooperativeContext } from '../../access';
import { createInvoicingReads } from '../application/assistant-reads';
import { PrismaThirdPartyStore } from './prisma-third-party-store';

const prisma = createTestPrisma();
const COOP_A = '40000000-0000-4000-8000-000000000001';
const COOP_B = '40000000-0000-4000-8000-000000000002';

const contextFor = (cooperativeId: string, level: 'read' | 'manage') =>
  ({
    userId: 'u',
    sessionId: 's',
    cooperativeId,
    membershipId: 'm',
    profileName: 'p',
    isPartner: false,
    permissions: [{ module: 'invoicing', level, scope: 'all' }],
  }) as unknown as CooperativeContext;

const reads = createInvoicingReads({
  thirdParties: new PrismaThirdPartyStore(prisma),
} as unknown as Parameters<typeof createInvoicingReads>[0]);

const list = async (...args: Parameters<typeof reads.listThirdParties>) =>
  (await reads.listThirdParties(...args)).rows;

async function party(
  cooperativeId: string,
  nif: string,
  name: string,
  createdAt: string,
  extra: { isSupplier?: boolean; isCustomer?: boolean; active?: boolean } = {},
) {
  await prisma.thirdParty.create({
    data: {
      cooperativeId,
      nif,
      name,
      isSupplier: extra.isSupplier ?? true,
      isCustomer: extra.isCustomer ?? false,
      active: extra.active ?? true,
      createdAt: new Date(createdAt),
    },
  });
}

beforeEach(async () => {
  await resetDatabase(prisma);
  await party(COOP_A, 'B12345674', 'Old Supplier', '2026-09-01T10:00:00Z');
  await party(COOP_A, 'B98765432', 'New Supplier', '2026-10-16T23:30:00Z');
  await party(COOP_A, 'F11223344', 'A Customer', '2026-10-02T08:00:00Z', {
    isSupplier: false,
    isCustomer: true,
  });
  await party(COOP_A, 'A58818501', 'Gone Supplier', '2026-10-18T08:00:00Z', { active: false });
  await party(COOP_B, 'B11111111', 'Other Coop Newest', '2026-10-19T08:00:00Z');
});
afterAll(() => prisma.$disconnect());

describe('US-AI-02 · list_third_parties read (integration)', () => {
  it('US-AI-02: newest first by creation date, inactive ones excluded by default', async () => {
    const rows = await list(contextFor(COOP_A, 'read'), {});

    expect(rows.map((row) => row.name)).toEqual(['New Supplier', 'A Customer', 'Old Supplier']);
    expect(rows[0]).toMatchObject({ createdAt: '2026-10-16', active: true, supplier: true });
  });

  it('BR-INV-01: never returns another cooperative, even if it is the newest', async () => {
    const rows = await list(contextFor(COOP_A, 'read'), { limit: 50 });

    expect(rows.map((row) => row.name)).not.toContain('Other Coop Newest');
    const other = await list(contextFor(COOP_B, 'read'), {});
    expect(other.map((row) => row.name)).toEqual(['Other Coop Newest']);
  });

  it('US-AI-02: filters by type, limit and an inclusive creation date range', async () => {
    const ctx = contextFor(COOP_A, 'read');

    expect((await list(ctx, { type: 'customer' })).map((r) => r.name)).toEqual(['A Customer']);
    expect((await list(ctx, { limit: 1 })).map((r) => r.name)).toEqual(['New Supplier']);
    const week = await list(ctx, {
      createdFrom: '2026-10-16',
      createdTo: '2026-10-16',
    });
    expect(week.map((r) => r.name)).toEqual(['New Supplier']);
  });

  it('BR-INV-14: inactive ones appear only for a user who can manage', async () => {
    const asReader = await list(contextFor(COOP_A, 'read'), {
      includeInactive: true,
    });
    expect(asReader.map((r) => r.name)).not.toContain('Gone Supplier');

    const asManager = await list(contextFor(COOP_A, 'manage'), {
      includeInactive: true,
    });
    expect(asManager.map((r) => r.name)).toEqual([
      'Gone Supplier',
      'New Supplier',
      'A Customer',
      'Old Supplier',
    ]);
  });
});
