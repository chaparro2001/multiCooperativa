import { describe, expect, it } from 'vitest';

import { removePageFurniture } from './page-furniture';

const page = (n: number, ...lines: string[]) => ({ page: n, text: lines.join('\n') });

describe('page furniture removal (ADR-023)', () => {
  it('removes a running header and a numbered footer repeated on every page', () => {
    const result = removePageFurniture([
      page(1, 'COOPERATIVA SAN ISIDRO - REGLAMENTO', 'Artículo 1. Uno.', 'Página 1'),
      page(2, 'COOPERATIVA SAN ISIDRO - REGLAMENTO', 'Artículo 2. Dos.', 'Página 2'),
      page(3, 'COOPERATIVA SAN ISIDRO - REGLAMENTO', 'Artículo 3. Tres.', 'Página 3'),
    ]);

    expect(result.map((p) => p.text)).toEqual([
      'Artículo 1. Uno.',
      'Artículo 2. Dos.',
      'Artículo 3. Tres.',
    ]);
  });

  it('removes a repeated line on at least half of the pages, not on fewer', () => {
    const header = 'Acta de la reunión';
    const half = removePageFurniture([
      page(1, header, 'a'),
      page(2, header, 'b'),
      page(3, 'c', 'x'),
      page(4, 'd', 'y'),
    ]);
    const fewer = removePageFurniture([
      page(1, header, 'a'),
      page(2, 'b', 'x'),
      page(3, 'c', 'y'),
      page(4, 'd', 'z'),
    ]);

    expect(half[0]?.text).toBe('a');
    expect(fewer[0]?.text).toBe(`${header}\na`);
  });

  it('never treats a one-page document as having furniture, but drops a lone page number', () => {
    expect(removePageFurniture([page(1, 'TÍTULO', 'Cuerpo.', '- 1 -')])[0]?.text).toBe(
      'TÍTULO\nCuerpo.',
    );
  });

  it('keeps repeated lines that are not at the edge of the page or only differ in inner numbers', () => {
    const result = removePageFurniture([
      page(1, 'a', 'b', 'Irrigation turn 1.', 'c', 'd'),
      page(2, 'e', 'f', 'Irrigation turn 2.', 'g', 'h'),
    ]);

    expect(result[0]?.text).toContain('Irrigation turn 1.');
    expect(result[1]?.text).toContain('Irrigation turn 2.');
  });
});
