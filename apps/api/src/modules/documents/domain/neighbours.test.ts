import { describe, expect, it } from 'vitest';

import { expandContext, MAX_CONTEXT_CHARS } from './neighbours';

const long = (text: string) => `${text} ${'palabra '.repeat(60)}fin.`.trim();

describe('neighbour expansion (ADR-023)', () => {
  it('leaves a complete, long-enough fragment unchanged', () => {
    const hit = { page: 1, content: long('Artículo 1. Completo.') };

    expect(
      expandContext(hit, {
        next: { page: 1, content: 'Otro texto.' },
        previous: { page: 1, content: 'Antes.' },
      }),
    ).toBe(hit.content);
  });

  it('appends the next fragment of the same page to a short one', () => {
    expect(
      expandContext(
        { page: 2, content: 'Artículo 5. Corto.' },
        { next: { page: 2, content: 'Artículo 6. Sigue.' } },
      ),
    ).toBe('Artículo 5. Corto.\n\nArtículo 6. Sigue.');
  });

  it('appends the next fragment when the text ends mid-sentence', () => {
    const hit = { page: 1, content: `${long('Artículo 3.')} y la cuota de` };

    expect(expandContext(hit, { next: { page: 1, content: 'ingreso es de 300 euros.' } })).toBe(
      `${hit.content}\n\ningreso es de 300 euros.`,
    );
  });

  it('prepends the previous fragment when the text starts mid-sentence', () => {
    const hit = { page: 1, content: long('de la asamblea se reúne.') };

    expect(expandContext(hit, { previous: { page: 1, content: 'La Asamblea General' } })).toBe(
      `La Asamblea General\n\n${hit.content}`,
    );
  });

  it('never uses a neighbour from another page (the citation keeps its page)', () => {
    expect(
      expandContext(
        { page: 1, content: 'Corto.' },
        { next: { page: 2, content: 'Otra página.' }, previous: { page: 0, content: 'Antes.' } },
      ),
    ).toBe('Corto.');
  });

  it('does not repeat the overlap between consecutive fragments', () => {
    const tail = 'las cuentas anuales del ejercicio anterior se aprueban';
    const next = `${tail} por mayoría simple de los votos presentes.`;

    expect(
      expandContext({ page: 1, content: `Corto ${tail}` }, { next: { page: 1, content: next } }),
    ).toBe(`Corto ${tail}\n\npor mayoría simple de los votos presentes.`);
  });

  it('stays within the character budget', () => {
    const hit = { page: 1, content: 'Corto.' };
    const huge = { page: 1, content: 'x'.repeat(MAX_CONTEXT_CHARS) };

    expect(expandContext(hit, { next: huge })).toBe('Corto.');
    expect(
      expandContext(hit, { next: { page: 1, content: 'y'.repeat(500) } }).length,
    ).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
  });
});
