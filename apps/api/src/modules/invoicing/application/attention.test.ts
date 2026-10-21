import { describe, expect, it } from 'vitest';

import { type CooperativeContext, ModuleAccessDeniedError } from '../../access';
import { InvalidDocumentError } from '../domain/errors';
import {
  type AttentionDeps,
  attentionCounts,
  getInvoicingSettings,
  INVOICING_SETTINGS_CHANGED_ACTION,
  updateInvoicingSettings,
} from './attention';
import { runDueDates } from './due-dates';
import type { InvoicingEvent } from './events';
import type { DueDatesStore } from './ports/due-dates-store';

const COOP = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const grant = (module: string, level: 'read' | 'manage') =>
  ({ module, level, scope: 'all' }) as const;
const contextOf = (permissions: ReturnType<typeof grant>[], cooperativeId = COOP) =>
  ({
    userId: 'u1',
    sessionId: 's1',
    cooperativeId,
    membershipId: 'm1',
    profileName: 'x',
    isPartner: false,
    permissions,
  }) as unknown as CooperativeContext;

const admin = contextOf([grant('users', 'manage')]);
const reader = contextOf([grant('invoicing', 'read')]);
const manager = contextOf([grant('invoicing', 'manage')]);
const partner = contextOf([grant('documents', 'read')]);

interface Note {
  cooperativeId: string;
  status: 'pending_invoicing' | 'invoiced' | 'voided';
  date: string;
}
interface Inv {
  cooperativeId: string;
  paymentStatus: 'pending' | 'overdue' | 'settled' | 'voided';
  dueDate: string;
}

/** In-memory stores applying the port contracts, with a fixed clock. */
function build(today: string, data: { invoices?: Inv[]; notes?: Note[] } = {}) {
  const days = new Map<string, number>();
  const audit: { cooperativeId: string; action: string; detail: Record<string, unknown> }[] = [];
  const deps: AttentionDeps = {
    today: () => today,
    settings: {
      toleranceBasisPoints: async () => 100,
      dueSoonDays: async (id) => days.get(id) ?? 15,
      saveDueSoonDays: async (id, value) => void days.set(id, value),
    },
    invoices: {
      countDueUntil: async (id, until) =>
        (data.invoices ?? []).filter(
          (i) =>
            i.cooperativeId === id &&
            (i.paymentStatus === 'pending' || i.paymentStatus === 'overdue') &&
            i.dueDate <= until,
        ).length,
    },
    staleNotes: {
      countPendingUpTo: async (id, upTo) =>
        (data.notes ?? []).filter(
          (n) =>
            n.cooperativeId === id &&
            n.status === 'pending_invoicing' &&
            (upTo === null || n.date <= upTo),
        ).length,
    },
    audit: async (cooperativeId, event) => {
      audit.push({ cooperativeId, action: event.action, detail: event.detail });
    },
  };
  return { deps, days, audit };
}

describe('invoicing settings (BR-INV-15)', () => {
  it('a cooperative that never chose gets 15 days', async () => {
    expect(await getInvoicingSettings(build('2026-10-21').deps, reader)).toEqual({
      dueSoonDays: 15,
    });
  });

  it('reads need invoicing access or the administration; others get 403', async () => {
    const { deps } = build('2026-10-21');
    await expect(getInvoicingSettings(deps, admin)).resolves.toEqual({ dueSoonDays: 15 });
    await expect(getInvoicingSettings(deps, manager)).resolves.toEqual({ dueSoonDays: 15 });
    await expect(getInvoicingSettings(deps, partner)).rejects.toBeInstanceOf(
      ModuleAccessDeniedError,
    );
  });

  it('only the administration writes: invoicing manage is not enough', async () => {
    const { deps, days, audit } = build('2026-10-21');
    for (const who of [manager, reader, partner]) {
      await expect(updateInvoicingSettings(deps, who, { dueSoonDays: 20 })).rejects.toBeInstanceOf(
        ModuleAccessDeniedError,
      );
    }
    expect(days.size).toBe(0);
    expect(audit).toEqual([]);
  });

  it('saves and audits the change with the previous and the new value', async () => {
    const { deps, days, audit } = build('2026-10-21');
    expect(await updateInvoicingSettings(deps, admin, { dueSoonDays: 7 })).toEqual({
      dueSoonDays: 7,
    });
    expect(days.get(COOP)).toBe(7);
    expect(audit).toEqual([
      {
        cooperativeId: COOP,
        action: INVOICING_SETTINGS_CHANGED_ACTION,
        detail: { dueSoonDays: { from: 15, to: 7 } },
      },
    ]);
  });

  it('writing the same value saves and audits nothing', async () => {
    const { deps, days, audit } = build('2026-10-21');
    await updateInvoicingSettings(deps, admin, { dueSoonDays: 15 });
    expect(days.size).toBe(0);
    expect(audit).toEqual([]);
  });

  it('rejects values out of range or not whole, naming the field', async () => {
    const { deps, audit } = build('2026-10-21');
    for (const bad of [0, 91, 2.5]) {
      await expect(updateInvoicingSettings(deps, admin, { dueSoonDays: bad })).rejects.toThrow(
        InvalidDocumentError,
      );
    }
    expect(audit).toEqual([]);
  });

  it('is per cooperative: another cooperative keeps its own value', async () => {
    const { deps } = build('2026-10-21');
    await updateInvoicingSettings(deps, admin, { dueSoonDays: 7 });
    expect(await getInvoicingSettings(deps, contextOf([grant('users', 'manage')], OTHER))).toEqual({
      dueSoonDays: 15,
    });
  });
});

describe('attention counts (BR-INV-16)', () => {
  const today = '2026-10-21';
  const data = {
    invoices: [
      { cooperativeId: COOP, paymentStatus: 'overdue', dueDate: '2026-09-01' },
      { cooperativeId: COOP, paymentStatus: 'pending', dueDate: '2026-10-21' },
      { cooperativeId: COOP, paymentStatus: 'pending', dueDate: '2026-11-05' },
      { cooperativeId: COOP, paymentStatus: 'pending', dueDate: '2026-11-06' },
      { cooperativeId: COOP, paymentStatus: 'settled', dueDate: '2026-10-01' },
      { cooperativeId: COOP, paymentStatus: 'voided', dueDate: '2026-10-01' },
      { cooperativeId: OTHER, paymentStatus: 'overdue', dueDate: '2026-09-01' },
    ] satisfies Inv[],
    notes: [
      { cooperativeId: COOP, status: 'pending_invoicing', date: '2026-08-01' },
      { cooperativeId: COOP, status: 'pending_invoicing', date: '2026-10-06' },
      { cooperativeId: COOP, status: 'pending_invoicing', date: '2026-10-07' },
      { cooperativeId: COOP, status: 'invoiced', date: '2026-08-01' },
      { cooperativeId: COOP, status: 'voided', date: '2026-08-01' },
      { cooperativeId: OTHER, status: 'pending_invoicing', date: '2026-08-01' },
    ] satisfies Note[],
  };

  it('counts with the default 15 days, at the fixed clock', async () => {
    const { deps } = build(today, data);
    expect(await attentionCounts(deps, reader)).toEqual({
      invoices: 3,
      deliveryNotes: 2,
      days: 15,
    });
  });

  it('follows the cooperative N: narrower and wider windows', async () => {
    const { deps } = build(today, data);
    await updateInvoicingSettings(deps, admin, { dueSoonDays: 1 });
    expect(await attentionCounts(deps, reader)).toEqual({ invoices: 2, deliveryNotes: 1, days: 1 });
    await updateInvoicingSettings(deps, admin, { dueSoonDays: 30 });
    // N of 30 or more: every pending note counts.
    expect(await attentionCounts(deps, reader)).toEqual({
      invoices: 4,
      deliveryNotes: 3,
      days: 30,
    });
  });

  it('only counts its own cooperative', async () => {
    const { deps } = build(today, data);
    expect(await attentionCounts(deps, contextOf([grant('invoicing', 'read')], OTHER))).toEqual({
      invoices: 1,
      deliveryNotes: 1,
      days: 15,
    });
  });

  it('needs invoicing read: the administration alone and a partner get 403', async () => {
    const { deps } = build(today, data);
    await expect(attentionCounts(deps, admin)).rejects.toBeInstanceOf(ModuleAccessDeniedError);
    await expect(attentionCounts(deps, partner)).rejects.toBeInstanceOf(ModuleAccessDeniedError);
  });
});

describe('daily due-date process uses the default window (BR-INV-15)', () => {
  it('asks the store to claim with today and the default days, and emits what it claims', async () => {
    const calls: unknown[][] = [];
    const store: DueDatesStore = {
      markOverdue: async () => [],
      claimDueSoon: async (...args) => {
        calls.push(args);
        return [
          {
            cooperativeId: COOP,
            thirdPartyId: 't',
            operation: 'purchase',
            invoiceId: 'i1',
            dueDate: '2026-11-03',
          },
        ];
      },
    };
    const events: InvoicingEvent[] = [];
    const result = await runDueDates(
      {
        dueDates: store,
        events: { publish: async (e) => void events.push(e) },
        now: () => new Date(0),
      },
      '2026-10-21',
    );
    expect(calls).toEqual([['2026-10-21', 15]]);
    expect(result).toEqual({ overdue: 0, dueSoon: 1 });
    expect(events.map((e) => e.type)).toEqual(['InvoiceDueSoon']);
  });
});
