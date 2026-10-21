import { describe, expect, it } from 'vitest';

import { messageText } from '@/forms/errors';

import { tileBadge } from './tile-badges';

const label = (id: string, counts: Parameters<typeof tileBadge>[1]) => {
  const badge = tileBadge(id, counts);
  return badge && messageText({ key: badge.labelKey, params: { count: badge.count } });
};

describe('tileBadge (home)', () => {
  it('has no badge for a tile without one, or with a zero or unknown count', () => {
    expect(tileBadge('documents', { invoices: 4 })).toBeNull();
    expect(tileBadge('invoices', { invoices: 0 })).toBeNull();
    expect(tileBadge('invoices', {})).toBeNull();
  });

  it('words the accessible label in the plural of each tile (BR-INV-16, US-ANN-08)', () => {
    expect(label('invoices', { invoices: 1 })).toBe('1 factura requiere atención');
    expect(label('invoices', { invoices: 3 })).toBe('3 facturas requieren atención');
    expect(label('delivery-notes', { 'delivery-notes': 1 })).toBe('1 albarán requiere atención');
    expect(label('delivery-notes', { 'delivery-notes': 12 })).toBe(
      '12 albaranes requieren atención',
    );
    expect(label('announcements', { announcements: 1 })).toBe('1 comunicado sin leer');
    expect(label('announcements', { announcements: 5 })).toBe('5 comunicados sin leer');
  });

  it('keeps the real count in the label even when the badge caps at 99+', () => {
    expect(label('announcements', { announcements: 150 })).toBe('150 comunicados sin leer');
  });
});
