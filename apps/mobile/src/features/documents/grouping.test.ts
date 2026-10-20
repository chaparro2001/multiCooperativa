import type { DocumentSummary } from '@multicooperativa/contracts';
import { describe, expect, it } from 'vitest';

import { groupByCategory } from './grouping';

const doc = (title: string, category: DocumentSummary['category']): DocumentSummary => ({
  id: title,
  title,
  category,
  documentDate: '2026-01-01',
  status: 'published',
  size: 1,
  indexingStatus: null,
});

describe('group documents (US-DOC-02)', () => {
  it('groups by category in a fixed order and keeps the order within each group', () => {
    const groups = groupByCategory([
      doc('Acta junio', 'minutes'),
      doc('Estatutos', 'bylaws'),
      doc('Acta marzo', 'minutes'),
    ]);

    expect(groups.map((g) => [g.title, g.data.map((d) => d.title)])).toEqual([
      ['Estatutos', ['Estatutos']],
      ['Actas', ['Acta junio', 'Acta marzo']],
    ]);
  });

  it('omits empty categories', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
