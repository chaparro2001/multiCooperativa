import { describe, expect, it } from 'vitest';

import { inlineDisposition, newFileKey } from './file-storage';

const COOP = '11111111-1111-4111-8111-111111111111';

describe('file keys (NFR-DOC-04, ADR-003)', () => {
  it('group by cooperative and area and end in a random UUID', () => {
    expect(newFileKey(COOP, 'announcements')).toMatch(
      new RegExp(`^cooperatives/${COOP}/announcements/[0-9a-f-]{36}$`),
    );
  });

  it('are never repeated', () => {
    expect(newFileKey(COOP, 'documents')).not.toBe(newFileKey(COOP, 'documents'));
  });

  it('reject areas that could escape the prefix', () => {
    expect(() => newFileKey(COOP, '../other')).toThrow();
    expect(() => newFileKey(COOP, 'Documents')).toThrow();
  });
});

describe('download name', () => {
  it('keeps the UTF-8 name and gives an ASCII fallback', () => {
    expect(inlineDisposition('Assembly minutes – June.pdf')).toBe(
      'inline; filename="Assembly minutes _ June.pdf"; filename*=UTF-8\'\'Assembly%20minutes%20%E2%80%93%20June.pdf',
    );
  });

  it('strips accents in the ASCII fallback and neutralizes quotes', () => {
    expect(inlineDisposition('Caf\u00e9 "annual".pdf')).toMatch(
      /^inline; filename="Cafe _annual_.pdf";/,
    );
  });
});
