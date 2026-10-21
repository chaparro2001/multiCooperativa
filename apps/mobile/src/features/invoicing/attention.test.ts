import type { InvoicingSettings } from '@multicooperativa/contracts';
import { describe, expect, it } from 'vitest';

import {
  canEditInvoicingSettings,
  daysBetween,
  invoiceAttention,
  noteAttention,
  todayInSpain,
} from './attention';

const today = '2026-10-21';
const invoice = (
  dueDate: string,
  paymentStatus: 'pending' | 'overdue' | 'settled' | 'voided' = 'pending',
) => ({
  dueDate,
  paymentStatus,
});
const note = (
  date: string,
  status: 'pending_invoicing' | 'invoiced' | 'voided' = 'pending_invoicing',
) => ({ date, status });

describe('daysBetween', () => {
  it('counts calendar days across month, year and leap days', () => {
    expect(daysBetween('2026-10-21', '2026-11-05')).toBe(15);
    expect(daysBetween('2026-12-30', '2027-01-14')).toBe(15);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-10-21', '2026-10-20')).toBe(-1);
  });
});

describe('todayInSpain', () => {
  it('uses the Spanish calendar day, not the UTC one', () => {
    expect(todayInSpain(new Date('2026-06-30T22:30:00Z'))).toBe('2026-07-01');
    expect(todayInSpain(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
});

const settings = (changes: Partial<InvoicingSettings> = {}): InvoicingSettings => ({
  invoiceNoticeEnabled: true,
  invoiceNoticeDays: 15,
  noteDeadlineEnabled: true,
  noteDeadlineDays: 30,
  noteNoticeEnabled: true,
  noteNoticeDays: 15,
  ...changes,
});

describe('invoiceAttention (BR-INV-16)', () => {
  it('marks overdue invoices with the days late', () => {
    expect(invoiceAttention(invoice('2026-10-18'), today, settings())).toEqual({
      kind: 'overdue',
      days: 3,
    });
    expect(
      invoiceAttention(invoice('2026-01-01', 'overdue'), today, settings({ invoiceNoticeDays: 1 })),
    ).toMatchObject({ kind: 'overdue' });
  });

  it('marks those due today and within N days, edges included', () => {
    const on = settings();
    expect(invoiceAttention(invoice(today), today, on)).toEqual({ kind: 'dueToday' });
    expect(invoiceAttention(invoice('2026-11-05'), today, on)).toEqual({
      kind: 'dueSoon',
      days: 15,
    });
    expect(invoiceAttention(invoice('2026-11-06'), today, on)).toBeNull();
    const one = settings({ invoiceNoticeDays: 1 });
    expect(invoiceAttention(invoice('2026-10-22'), today, one)).toEqual({
      kind: 'dueSoon',
      days: 1,
    });
    expect(invoiceAttention(invoice('2026-10-23'), today, one)).toBeNull();
  });

  it('with the notice off marks only the overdue ones, whatever the stored days', () => {
    const off = settings({ invoiceNoticeEnabled: false, invoiceNoticeDays: 90 });
    expect(invoiceAttention(invoice('2026-10-20'), today, off)).toEqual({
      kind: 'overdue',
      days: 1,
    });
    expect(invoiceAttention(invoice(today), today, off)).toBeNull();
    expect(invoiceAttention(invoice('2026-10-25'), today, off)).toBeNull();
  });

  it('ignores settled and voided invoices', () => {
    expect(invoiceAttention(invoice('2026-10-01', 'settled'), today, settings())).toBeNull();
    expect(invoiceAttention(invoice('2026-10-01', 'voided'), today, settings())).toBeNull();
  });
});

describe('noteAttention (BR-INV-16, US-INV-09)', () => {
  it('marks pending notes past the deadline as stale', () => {
    expect(noteAttention(note('2026-09-11'), today, settings())).toEqual({ days: 40, stale: true });
    expect(noteAttention(note('2026-09-21'), today, settings())).toEqual({ days: 30, stale: true });
  });

  it('marks those reaching the deadline within the notice, edges included, as not yet stale', () => {
    expect(noteAttention(note('2026-10-06'), today, settings())).toEqual({
      days: 15,
      stale: false,
    });
    expect(noteAttention(note('2026-10-07'), today, settings())).toBeNull();
  });

  it('follows a custom deadline and notice, with no hardcoded 30 days', () => {
    const custom = settings({ noteDeadlineDays: 60, noteNoticeDays: 10 });
    expect(noteAttention(note('2026-09-01'), today, custom)).toEqual({ days: 50, stale: false });
    expect(noteAttention(note('2026-09-02'), today, custom)).toBeNull();
    expect(noteAttention(note('2026-08-22'), today, custom)).toEqual({ days: 60, stale: true });
    // A 30-day-old note is no longer stale with a 60-day deadline.
    expect(noteAttention(note('2026-09-21'), today, settings({ noteDeadlineDays: 60 }))).toBeNull();
  });

  it('with the notice off marks only the notes past the deadline', () => {
    const off = settings({ noteNoticeEnabled: false });
    expect(noteAttention(note('2026-10-06'), today, off)).toBeNull();
    expect(noteAttention(note('2026-09-22'), today, off)).toBeNull();
    expect(noteAttention(note('2026-09-21'), today, off)).toEqual({ days: 30, stale: true });
  });

  it('with the deadline off there is no stale concept: nothing is marked, whatever the notice', () => {
    for (const noteNoticeEnabled of [true, false]) {
      const off = settings({ noteDeadlineEnabled: false, noteNoticeEnabled });
      expect(noteAttention(note('2020-01-01'), today, off)).toBeNull();
    }
  });

  it('a stored notice not shorter than the deadline marks every pending note', () => {
    const wide = settings({ noteNoticeDays: 45 });
    expect(noteAttention(note(today), today, wide)).toEqual({ days: 0, stale: false });
    expect(noteAttention(note('2026-10-25'), today, wide)).toEqual({ days: 0, stale: false });
  });

  it('ignores invoiced and voided notes', () => {
    expect(noteAttention(note('2026-01-01', 'invoiced'), today, settings())).toBeNull();
    expect(noteAttention(note('2026-01-01', 'voided'), today, settings())).toBeNull();
  });
});

describe('canEditInvoicingSettings (BR-INV-15)', () => {
  it('is for the administration: users module at manage level', () => {
    expect(canEditInvoicingSettings([{ module: 'users', level: 'manage' }])).toBe(true);
    expect(canEditInvoicingSettings([{ module: 'invoicing', level: 'manage' }])).toBe(false);
    expect(canEditInvoicingSettings([{ module: 'users', level: 'read' }])).toBe(false);
    expect(canEditInvoicingSettings(undefined)).toBe(false);
  });
});
