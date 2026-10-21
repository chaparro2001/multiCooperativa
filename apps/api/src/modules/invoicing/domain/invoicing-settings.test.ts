import { describe, expect, it } from 'vitest';

import { InvalidDocumentError } from './errors';
import {
  assertInvoicingNoticeSettings,
  DEFAULT_INVOICING_NOTICE_SETTINGS,
  invoiceAttentionUntil,
  invoiceNeedsAttention,
  type InvoicingNoticeSettings,
  noteAttentionUpTo,
  noteDeadlineCutoff,
  noteNeedsAttention,
} from './invoicing-settings';

const today = '2026-10-21';
const withSettings = (changes: Partial<InvoicingNoticeSettings>): InvoicingNoticeSettings => ({
  ...DEFAULT_INVOICING_NOTICE_SETTINGS,
  ...changes,
});

describe('validation (BR-INV-15)', () => {
  it('the defaults are valid: 15 days for invoices, deadline 30, note notice 15, all on', () => {
    expect(DEFAULT_INVOICING_NOTICE_SETTINGS).toEqual({
      invoiceNoticeEnabled: true,
      invoiceNoticeDays: 15,
      noteDeadlineEnabled: true,
      noteDeadlineDays: 30,
      noteNoticeEnabled: true,
      noteNoticeDays: 15,
    });
    expect(assertInvoicingNoticeSettings(DEFAULT_INVOICING_NOTICE_SETTINGS)).toEqual(
      DEFAULT_INVOICING_NOTICE_SETTINGS,
    );
  });

  it('invoice notice: whole number from 1 to 90', () => {
    for (const ok of [1, 90]) {
      expect(() =>
        assertInvoicingNoticeSettings(withSettings({ invoiceNoticeDays: ok })),
      ).not.toThrow();
    }
    for (const bad of [0, 91, -3, 1.5, Number.NaN]) {
      expect(() => assertInvoicingNoticeSettings(withSettings({ invoiceNoticeDays: bad }))).toThrow(
        expect.objectContaining({ field: 'invoiceNoticeDays' }),
      );
    }
  });

  it('note deadline: whole number from 1 to 365', () => {
    for (const ok of [1, 365]) {
      expect(() =>
        assertInvoicingNoticeSettings(
          withSettings({ noteDeadlineDays: ok, noteNoticeEnabled: false }),
        ),
      ).not.toThrow();
    }
    for (const bad of [0, 366, 2.5]) {
      expect(() => assertInvoicingNoticeSettings(withSettings({ noteDeadlineDays: bad }))).toThrow(
        expect.objectContaining({ field: 'noteDeadlineDays' }),
      );
    }
  });

  it('note notice: whole number from 1 to 365', () => {
    expect(() =>
      assertInvoicingNoticeSettings(withSettings({ noteDeadlineDays: 365, noteNoticeDays: 364 })),
    ).not.toThrow();
    for (const bad of [0, 366, 0.5]) {
      expect(() => assertInvoicingNoticeSettings(withSettings({ noteNoticeDays: bad }))).toThrow(
        expect.objectContaining({ field: 'noteNoticeDays' }),
      );
    }
  });

  it('with both note alerts on, the notice must be shorter than the deadline', () => {
    expect(() =>
      assertInvoicingNoticeSettings(withSettings({ noteDeadlineDays: 30, noteNoticeDays: 29 })),
    ).not.toThrow();
    for (const notice of [30, 31]) {
      expect(() =>
        assertInvoicingNoticeSettings(
          withSettings({ noteDeadlineDays: 30, noteNoticeDays: notice }),
        ),
      ).toThrow(expect.objectContaining({ field: 'noteNoticeDays' }));
    }
  });

  it('the rule does not apply when the notice or the deadline is off, and the number is kept', () => {
    const off = (changes: Partial<InvoicingNoticeSettings>) =>
      assertInvoicingNoticeSettings(
        withSettings({ noteDeadlineDays: 10, noteNoticeDays: 50, ...changes }),
      );
    expect(off({ noteNoticeEnabled: false }).noteNoticeDays).toBe(50);
    expect(off({ noteDeadlineEnabled: false }).noteNoticeDays).toBe(50);
  });

  it('rejects a flag that is not a boolean', () => {
    expect(() =>
      assertInvoicingNoticeSettings({
        ...DEFAULT_INVOICING_NOTICE_SETTINGS,
        noteNoticeEnabled: 'yes',
      }),
    ).toThrow(InvalidDocumentError);
  });
});

describe('invoices attention (BR-INV-16)', () => {
  const due = (dueDate: string, paymentStatus = 'pending') => ({ paymentStatus, dueDate });

  it('notice on: overdue ones and those due up to N days from today, edges included', () => {
    const on = withSettings({ invoiceNoticeEnabled: true, invoiceNoticeDays: 15 });
    expect(invoiceNeedsAttention(due('2026-10-20'), today, on)).toBe(true);
    expect(invoiceNeedsAttention(due('2026-10-21'), today, on)).toBe(true);
    expect(invoiceNeedsAttention(due('2026-11-05'), today, on)).toBe(true);
    expect(invoiceNeedsAttention(due('2026-11-06'), today, on)).toBe(false);
    expect(invoiceAttentionUntil(today, on)).toBe('2026-11-05');
  });

  it('notice off: only the overdue ones, not even those due today', () => {
    const off = withSettings({ invoiceNoticeEnabled: false });
    expect(invoiceNeedsAttention(due('2026-10-20'), today, off)).toBe(true);
    expect(invoiceNeedsAttention(due('2025-01-01', 'overdue'), today, off)).toBe(true);
    expect(invoiceNeedsAttention(due('2026-10-21'), today, off)).toBe(false);
    expect(invoiceNeedsAttention(due('2026-10-22'), today, off)).toBe(false);
    expect(invoiceAttentionUntil(today, off)).toBe('2026-10-20');
  });

  it('keeps the stored number while off, and never counts settled or voided', () => {
    const off = withSettings({ invoiceNoticeEnabled: false, invoiceNoticeDays: 60 });
    expect(invoiceNeedsAttention(due('2026-10-25'), today, off)).toBe(false);
    for (const status of ['settled', 'voided']) {
      expect(invoiceNeedsAttention(due('2026-10-01', status), today, withSettings({}))).toBe(false);
    }
  });

  it('crosses month and year ends exactly', () => {
    const on = withSettings({});
    expect(invoiceNeedsAttention(due('2027-01-14'), '2026-12-30', on)).toBe(true);
    expect(invoiceNeedsAttention(due('2027-01-15'), '2026-12-30', on)).toBe(false);
    expect(invoiceNeedsAttention(due('2028-02-29'), '2028-02-14', on)).toBe(true);
  });
});

describe('delivery notes attention (US-INV-09, BR-INV-16)', () => {
  const pendingOn = (date: string) => ({ status: 'pending_invoicing', date });

  it('deadline on, notice on: today minus (deadline - notice), edges included', () => {
    const s = withSettings({ noteDeadlineDays: 30, noteNoticeDays: 15 });
    expect(noteAttentionUpTo(today, s)).toEqual({ upTo: '2026-10-06' });
    expect(noteNeedsAttention(pendingOn('2026-10-06'), today, s)).toBe(true);
    expect(noteNeedsAttention(pendingOn('2026-10-07'), today, s)).toBe(false);
    expect(noteNeedsAttention(pendingOn('2026-08-01'), today, s)).toBe(true);
  });

  it('follows a custom deadline: 60 days, notice 10', () => {
    const s = withSettings({ noteDeadlineDays: 60, noteNoticeDays: 10 });
    expect(noteAttentionUpTo(today, s)).toEqual({ upTo: '2026-09-01' });
    expect(noteNeedsAttention(pendingOn('2026-09-01'), today, s)).toBe(true);
    expect(noteNeedsAttention(pendingOn('2026-09-02'), today, s)).toBe(false);
  });

  it('deadline on, notice off: only the notes whose deadline is reached', () => {
    const s = withSettings({ noteDeadlineDays: 30, noteNoticeEnabled: false });
    expect(noteAttentionUpTo(today, s)).toEqual({ upTo: '2026-09-21' });
    expect(noteNeedsAttention(pendingOn('2026-09-21'), today, s)).toBe(true);
    expect(noteNeedsAttention(pendingOn('2026-09-22'), today, s)).toBe(false);
    expect(noteNeedsAttention(pendingOn('2026-10-06'), today, s)).toBe(false);
  });

  it('deadline off: no concept at all, the notice is irrelevant and keeps its number', () => {
    for (const noteNoticeEnabled of [true, false]) {
      const s = withSettings({ noteDeadlineEnabled: false, noteNoticeEnabled, noteNoticeDays: 99 });
      expect(noteAttentionUpTo(today, s)).toBeNull();
      expect(noteDeadlineCutoff(today, s)).toBeNull();
      expect(noteNeedsAttention(pendingOn('2020-01-01'), today, s)).toBe(false);
    }
  });

  it('the deadline cutoff is today minus the deadline', () => {
    expect(noteDeadlineCutoff(today, withSettings({ noteDeadlineDays: 30 }))).toBe('2026-09-21');
    expect(noteDeadlineCutoff(today, withSettings({ noteDeadlineDays: 365 }))).toBe('2025-10-21');
  });

  it('a stored notice not shorter than the deadline counts every pending note', () => {
    const s = withSettings({ noteDeadlineDays: 30, noteNoticeDays: 45 });
    expect(noteAttentionUpTo(today, s)).toEqual({ upTo: null });
    expect(noteNeedsAttention(pendingOn(today), today, s)).toBe(true);
    expect(noteNeedsAttention(pendingOn('2026-10-25'), today, s)).toBe(true);
  });

  it('never counts an invoiced or voided note', () => {
    const s = withSettings({});
    expect(noteNeedsAttention({ status: 'invoiced', date: '2026-01-01' }, today, s)).toBe(false);
    expect(noteNeedsAttention({ status: 'voided', date: '2026-01-01' }, today, s)).toBe(false);
  });
});
