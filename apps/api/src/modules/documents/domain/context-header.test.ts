import { describe, expect, it } from 'vitest';

import { contextHeader, embeddedText, INDEXED_HEADER_PARTS } from './context-header';

describe('contextual header (ADR-023)', () => {
  it('joins title, category and section', () => {
    expect(
      contextHeader({
        title: ' Estatutos de la cooperativa ',
        category: 'bylaws',
        section: 'TÍTULO IV > Artículo 25',
      }),
    ).toBe('Estatutos de la cooperativa · Estatutos · TÍTULO IV > Artículo 25');
  });

  it('indexes only the parts asked for', () => {
    const input = { title: 'Acta', category: 'minutes' as const, section: 'Punto 1' };
    expect(contextHeader(input, ['title'])).toBe('Acta');
    expect(contextHeader(input, ['title', 'section'])).toBe('Acta · Punto 1');
    expect(INDEXED_HEADER_PARTS).toEqual(['title']);
  });

  it('leaves out a missing section', () => {
    expect(contextHeader({ title: 'Acta', category: 'minutes', section: null })).toBe(
      'Acta · Acta',
    );
  });

  it('prefixes the embedded text without touching the content', () => {
    expect(embeddedText('Doc · Otros', 'texto')).toBe('Doc · Otros\ntexto');
    expect(embeddedText('', 'texto')).toBe('texto');
  });
});
