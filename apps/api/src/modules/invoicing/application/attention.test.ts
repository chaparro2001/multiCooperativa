import { describe, expect, it } from 'vitest';

import { type CooperativeContext, ModuleAccessDeniedError } from '../../access';
import { InvalidDocumentError } from '../domain/errors';
import {
  DEFAULT_INVOICING_NOTICE_SETTINGS,
  type InvoicingNoticeSettings,
} from '../domain/invoicing-settings';
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
  const stored = new Map<string, InvoicingNoticeSettings>();
  const audit: { cooperativeId: string; action: string; detail: Record<string, unknown> }[] = [];
  const deps: AttentionDeps = {
    today: () => today,
    settings: {
      toleranceBasisPoints: async () => 100,
      noticeSettings: async (id) => stored.get(id) ?? DEFAULT_INVOICING_NOTICE_SETTINGS,
      saveNoticeSettings: async (id, value) => void stored.set(id, value),
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
  return { deps, stored, audit };
}

const DEFAULTS = DEFAULT_INVOICING_NOTICE_SETTINGS;
const choose = (changes: Partial<InvoicingNoticeSettings>) => ({ ...DEFAULTS, ...changes });

describe('invoicing settings (BR-INV-15)', () => {
  it('a cooperative that never chose gets the defaults: all on, 15 / 30 / 15 days', async () => {
    expect(await getInvoicingSettings(build('2026-10-21').deps, reader)).toEqual(DEFAULTS);
  });

  it('reads need invoicing access or the administration; others get 403', async () => {
    const { deps } = build('2026-10-21');
    await expect(getInvoicingSettings(deps, admin)).resolves.toEqual(DEFAULTS);
    await expect(getInvoicingSettings(deps, manager)).resolves.toEqual(DEFAULTS);
    await expect(getInvoicingSettings(deps, partner)).rejects.toBeInstanceOf(
      ModuleAccessDeniedError,
    );
  });

  it('only the administration writes: invoicing manage is not enough', async () => {
    const { deps, stored, audit } = build('2026-10-21');
    for (const who of [manager, reader, partner]) {
      await expect(
        updateInvoicingSettings(deps, who, choose({ invoiceNoticeDays: 20 })),
      ).rejects.toBeInstanceOf(ModuleAccessDeniedError);
    }
    expect(stored.size).toBe(0);
    expect(audit).toEqual([]);
  });

  it('saves and audits each changed field with its previous and new value', async () => {
    const { deps, stored, audit } = build('2026-10-21');
    const next = choose({ invoiceNoticeDays: 7, noteDeadlineEnabled: false, noteNoticeDays: 5 });
    expect(await updateInvoicingSettings(deps, admin, next)).toEqual(next);
    expect(stored.get(COOP)).toEqual(next);
    expect(audit).toEqual([
      {
        cooperativeId: COOP,
        action: INVOICING_SETTINGS_CHANGED_ACTION,
        detail: {
          invoiceNoticeDays: { from: 15, to: 7 },
          noteDeadlineEnabled: { from: true, to: false },
          noteNoticeDays: { from: 15, to: 5 },
        },
      },
    ]);
  });

  it('writing the same values saves and audits nothing', async () => {
    const { deps, stored, audit } = build('2026-10-21');
    await updateInvoicingSettings(deps, admin, DEFAULTS);
    expect(stored.size).toBe(0);
    expect(audit).toEqual([]);
  });

  it('rejects invalid values naming the field, saving and auditing nothing', async () => {
    const { deps, stored, audit } = build('2026-10-21');
    const cases: [Partial<InvoicingNoticeSettings>, string][] = [
      [{ invoiceNoticeDays: 91 }, 'invoiceNoticeDays'],
      [{ noteDeadlineDays: 366 }, 'noteDeadlineDays'],
      [{ noteNoticeDays: 0 }, 'noteNoticeDays'],
      [{ noteDeadlineDays: 20, noteNoticeDays: 20 }, 'noteNoticeDays'],
      [{ invoiceNoticeDays: 2.5 }, 'invoiceNoticeDays'],
    ];
    for (const [changes, field] of cases) {
      const attempt = updateInvoicingSettings(deps, admin, choose(changes));
      await expect(attempt).rejects.toBeInstanceOf(InvalidDocumentError);
      await expect(attempt).rejects.toMatchObject({ field });
    }
    expect(stored.size).toBe(0);
    expect(audit).toEqual([]);
  });

  it('a notice not shorter than the deadline is fine while one of them is off', async () => {
    const { deps } = build('2026-10-21');
    const next = choose({ noteDeadlineDays: 10, noteNoticeDays: 50, noteNoticeEnabled: false });
    await expect(updateInvoicingSettings(deps, admin, next)).resolves.toEqual(next);
  });

  it('is per cooperative: another cooperative keeps its own values', async () => {
    const { deps } = build('2026-10-21');
    await updateInvoicingSettings(deps, admin, choose({ invoiceNoticeDays: 7 }));
    expect(await getInvoicingSettings(deps, contextOf([grant('users', 'manage')], OTHER))).toEqual(
      DEFAULTS,
    );
  });
});

describe('attention counts (BR-INV-16)', () => {
  const today = '2026-10-21';
  const data = {
    invoices: [
      { cooperativeId: COOP, paymentStatus: 'overdue', dueDate: '2026-09-01' },
      { cooperativeId: COOP, paymentStatus: 'pending', dueDate: '2026-10-20' },
      { cooperativeId: COOP, paymentStatus: 'pending', dueDate: '2026-10-21' },
      { cooperativeId: COOP, paymentStatus: 'pending', dueDate: '2026-11-05' },
      { cooperativeId: COOP, paymentStatus: 'pending', dueDate: '2026-11-06' },
      { cooperativeId: COOP, paymentStatus: 'settled', dueDate: '2026-10-01' },
      { cooperativeId: COOP, paymentStatus: 'voided', dueDate: '2026-10-01' },
      { cooperativeId: OTHER, paymentStatus: 'overdue', dueDate: '2026-09-01' },
    ] satisfies Inv[],
    notes: [
      { cooperativeId: COOP, status: 'pending_invoicing', date: '2026-08-01' },
      { cooperativeId: COOP, status: 'pending_invoicing', date: '2026-09-21' },
      { cooperativeId: COOP, status: 'pending_invoicing', date: '2026-10-06' },
      { cooperativeId: COOP, status: 'pending_invoicing', date: '2026-10-07' },
      { cooperativeId: COOP, status: 'invoiced', date: '2026-08-01' },
      { cooperativeId: COOP, status: 'voided', date: '2026-08-01' },
      { cooperativeId: OTHER, status: 'pending_invoicing', date: '2026-08-01' },
    ] satisfies Note[],
  };
  const countsWith = async (changes: Partial<InvoicingNoticeSettings>) => {
    const { deps } = build(today, data);
    await updateInvoicingSettings(deps, admin, choose(changes));
    const { invoices, deliveryNotes } = await attentionCounts(deps, reader);
    return { invoices, deliveryNotes };
  };

  it('counts with the defaults and returns the effective settings', async () => {
    const { deps } = build(today, data);
    expect(await attentionCounts(deps, reader)).toEqual({
      invoices: 4,
      deliveryNotes: 3,
      settings: DEFAULTS,
    });
  });

  it('invoice notice: on counts the window, off only the overdue ones', async () => {
    expect(await countsWith({ invoiceNoticeEnabled: true, invoiceNoticeDays: 1 })).toMatchObject({
      invoices: 3,
    });
    expect(await countsWith({ invoiceNoticeEnabled: true, invoiceNoticeDays: 90 })).toMatchObject({
      invoices: 5,
    });
    // Off: only what is due before today, whatever its stored number of days.
    expect(await countsWith({ invoiceNoticeEnabled: false })).toMatchObject({ invoices: 2 });
    expect(await countsWith({ invoiceNoticeEnabled: false, invoiceNoticeDays: 90 })).toMatchObject({
      invoices: 2,
    });
  });

  it('note alerts, every combination of the toggles', async () => {
    // Deadline on, notice on (deadline 30, notice 15): past it plus reaching it within 15 days.
    expect(await countsWith({})).toMatchObject({ deliveryNotes: 3 });
    // Deadline on, notice off: only the notes already past the deadline.
    expect(await countsWith({ noteNoticeEnabled: false })).toMatchObject({ deliveryNotes: 2 });
    // Deadline off: no stale-notes concept, with the notice on or off.
    expect(await countsWith({ noteDeadlineEnabled: false })).toMatchObject({ deliveryNotes: 0 });
    expect(
      await countsWith({ noteDeadlineEnabled: false, noteNoticeEnabled: false }),
    ).toMatchObject({ deliveryNotes: 0 });
  });

  it('a custom deadline replaces the 30 days', async () => {
    expect(await countsWith({ noteDeadlineDays: 60, noteNoticeDays: 10 })).toMatchObject({
      deliveryNotes: 1,
    });
    expect(await countsWith({ noteDeadlineDays: 10, noteNoticeEnabled: false })).toMatchObject({
      deliveryNotes: 4,
    });
  });

  it('the three alerts are independent of each other', async () => {
    expect(await countsWith({ invoiceNoticeEnabled: false, noteDeadlineEnabled: false })).toEqual({
      invoices: 2,
      deliveryNotes: 0,
    });
    expect(await countsWith({ noteNoticeEnabled: false })).toEqual({
      invoices: 4,
      deliveryNotes: 2,
    });
  });

  it('only counts its own cooperative', async () => {
    const { deps } = build(today, data);
    expect(await attentionCounts(deps, contextOf([grant('invoicing', 'read')], OTHER))).toEqual({
      invoices: 1,
      deliveryNotes: 1,
      settings: DEFAULTS,
    });
  });

  it('needs invoicing read: the administration alone and a partner get 403', async () => {
    const { deps } = build(today, data);
    await expect(attentionCounts(deps, admin)).rejects.toBeInstanceOf(ModuleAccessDeniedError);
    await expect(attentionCounts(deps, partner)).rejects.toBeInstanceOf(ModuleAccessDeniedError);
  });
});

describe('daily due-date process asks for the defaults of a cooperative without row (BR-INV-15)', () => {
  it('asks the store to claim with today and the default notice, and emits what it claims', async () => {
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
    expect(calls).toEqual([['2026-10-21', { enabled: true, days: 15 }]]);
    expect(result).toEqual({ overdue: 0, dueSoon: 1 });
    expect(events.map((e) => e.type)).toEqual(['InvoiceDueSoon']);
  });
});
