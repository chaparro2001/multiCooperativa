import type { DocumentSummary } from '@multicooperativa/contracts';
import { describe, expect, it } from 'vitest';

import { groupByCategory } from './grouping';

const doc = (title: string, category: DocumentSummary['category']): DocumentSummary => ({
  id: title,
  title,
  category,
  documentDate: '2026-01-01',
  status: 'publicado',
  size: 1,
  indexingStatus: null,
});

describe('agrupar documentos (HU-DOC-02)', () => {
  it('agrupa por categoría en orden fijo y conserva el orden de cada grupo', () => {
    const groups = groupByCategory([
      doc('Acta junio', 'actas'),
      doc('Estatutos', 'estatutos'),
      doc('Acta marzo', 'actas'),
    ]);

    expect(groups.map((g) => [g.title, g.data.map((d) => d.title)])).toEqual([
      ['Estatutos', ['Estatutos']],
      ['Actas', ['Acta junio', 'Acta marzo']],
    ]);
  });

  it('omite las categorías vacías', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
