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

describe('invoiceAttention (BR-INV-16)', () => {
  it('marks overdue invoices with the days late', () => {
    expect(invoiceAttention(invoice('2026-10-18'), today, 15)).toEqual({
      kind: 'overdue',
      days: 3,
    });
    expect(invoiceAttention(invoice('2026-01-01', 'overdue'), today, 1)).toMatchObject({
      kind: 'overdue',
    });
  });

  it('marks those due today and within N days, edges included', () => {
    expect(invoiceAttention(invoice(today), today, 15)).toEqual({ kind: 'dueToday' });
    expect(invoiceAttention(invoice('2026-11-05'), today, 15)).toEqual({
      kind: 'dueSoon',
      days: 15,
    });
    expect(invoiceAttention(invoice('2026-11-06'), today, 15)).toBeNull();
    expect(invoiceAttention(invoice('2026-10-22'), today, 1)).toEqual({ kind: 'dueSoon', days: 1 });
    expect(invoiceAttention(invoice('2026-10-23'), today, 1)).toBeNull();
  });

  it('ignores settled and voided invoices', () => {
    expect(invoiceAttention(invoice('2026-10-01', 'settled'), today, 15)).toBeNull();
    expect(invoiceAttention(invoice('2026-10-01', 'voided'), today, 15)).toBeNull();
  });
});

describe('noteAttention (BR-INV-16, US-INV-09)', () => {
  it('marks pending notes older than 30 days as stale', () => {
    expect(noteAttention(note('2026-09-11'), today, 15)).toEqual({ days: 40, stale: true });
    expect(noteAttention(note('2026-09-21'), today, 15)).toEqual({ days: 30, stale: true });
  });

  it('marks those reaching 30 days within N days, edges included, as not yet stale', () => {
    expect(noteAttention(note('2026-10-06'), today, 15)).toEqual({ days: 15, stale: false });
    expect(noteAttention(note('2026-10-07'), today, 15)).toBeNull();
  });

  it('with N of 30 or more every pending note counts', () => {
    expect(noteAttention(note(today), today, 30)).toEqual({ days: 0, stale: false });
    expect(noteAttention(note('2026-10-25'), today, 90)).toEqual({ days: 0, stale: false });
    expect(noteAttention(note(today), today, 29)).toBeNull();
  });

  it('ignores invoiced and voided notes', () => {
    expect(noteAttention(note('2026-01-01', 'invoiced'), today, 15)).toBeNull();
    expect(noteAttention(note('2026-01-01', 'voided'), today, 15)).toBeNull();
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
