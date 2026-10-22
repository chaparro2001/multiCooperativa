import { describe, expect, it } from 'vitest';

import { classifyLine, isPageNumber, SectionPath } from './structure';

describe('structure of cooperative documents (ADR-023)', () => {
  it.each([
    ['TÍTULO IV. RÉGIMEN ECONÓMICO', { kind: 'heading', level: 1 }],
    ['Título II', { kind: 'heading', level: 1 }],
    ['CAPÍTULO II. FONDOS', { kind: 'heading', level: 2 }],
    ['Sección 3.ª Voto', { kind: 'heading', level: 3 }],
    ['Disposición final primera', { kind: 'heading', level: 1 }],
    ['ESTATUTOS DE LA COOPERATIVA', { kind: 'heading', level: 1 }],
    ['Artículo 14. Asamblea General.', { kind: 'article', label: 'Artículo 14' }],
    ['ARTÍCULO 7º - Capital', { kind: 'article', label: 'Artículo 7' }],
    ['Articulo 5. Derechos', { kind: 'article', label: 'Artículo 5' }],
    ['3. Descuento por impurezas.', { kind: 'item' }],
    ['Primero. Lectura del acta.', { kind: 'item' }],
    ['Punto 2. Distribución.', { kind: 'item' }],
    ['de la asamblea se reúne una vez', { kind: 'text' }],
    ['conforme al artículo 14 de estos estatutos', { kind: 'text' }],
    ['SI', { kind: 'text' }],
  ])('classifies %j', (line, expected) => {
    expect(classifyLine(line)).toMatchObject(expected);
  });

  it.each([
    ['3', true],
    ['Página 3', true],
    ['- 3 -', true],
    ['3 de 10', true],
    ['Artículo 3', false],
    ['2026', true],
    ['Total 2026', false],
  ])('page number %j: %s', (line, expected) => {
    expect(isPageNumber(line)).toBe(expected);
  });

  it('a heading resets the deeper levels of the path', () => {
    const path = new SectionPath();
    path.enter(1, 'TÍTULO I');
    path.enter(2, 'CAPÍTULO I');
    expect(path.toString()).toBe('TÍTULO I > CAPÍTULO I');
    path.enter(2, 'CAPÍTULO II');
    expect(path.toString()).toBe('TÍTULO I > CAPÍTULO II');
    path.enter(1, 'TÍTULO II');
    expect(path.toString()).toBe('TÍTULO II');
  });
});
