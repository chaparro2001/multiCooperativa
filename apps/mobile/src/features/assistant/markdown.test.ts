import { describe, expect, it } from 'vitest';

import { parseInline, parseMarkdown } from './markdown';

describe('assistant answers in Markdown (US-AI-01)', () => {
  it('splits paragraphs on blank lines and joins wrapped lines', () => {
    expect(parseMarkdown('First line\ncontinues.\n\nSecond.')).toEqual([
      { kind: 'paragraph', inlines: [{ text: 'First line continues.' }] },
      { kind: 'paragraph', inlines: [{ text: 'Second.' }] },
    ]);
  });

  it('reads bullet and numbered lists', () => {
    expect(parseMarkdown('Intro:\n- **Tarifas** (2026-10-20): aprobadas\n* Otro\n2. Paso')).toEqual(
      [
        { kind: 'paragraph', inlines: [{ text: 'Intro:' }] },
        {
          kind: 'bullet',
          inlines: [{ text: 'Tarifas', bold: true }, { text: ' (2026-10-20): aprobadas' }],
        },
        { kind: 'bullet', inlines: [{ text: 'Otro' }] },
        { kind: 'numbered', marker: '2.', inlines: [{ text: 'Paso' }] },
      ],
    );
  });

  it('turns headings into their own block', () => {
    expect(parseMarkdown('## Resumen\nTexto')).toEqual([
      { kind: 'heading', inlines: [{ text: 'Resumen' }] },
      { kind: 'paragraph', inlines: [{ text: 'Texto' }] },
    ]);
  });

  it('marks bold and code, and keeps unmatched markers as text', () => {
    expect(parseInline('Total **421,00 €** con `IVA` y 2*3')).toEqual([
      { text: 'Total ' },
      { text: '421,00 €', bold: true },
      { text: ' con ' },
      { text: 'IVA', code: true },
      { text: ' y 2*3' },
    ]);
    expect(parseInline('**sin cerrar')).toEqual([{ text: '**sin cerrar' }]);
  });
});
