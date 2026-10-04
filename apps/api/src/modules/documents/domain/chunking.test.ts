import { describe, expect, it } from 'vitest';

import { CHUNK_OVERLAP, CHUNK_TARGET, chunkPages, hasExtractableText } from './chunking';

const paragraph = (words: number, seed = 'palabra') =>
  Array.from({ length: words }, (_, i) => `${seed}${i}`).join(' ') + '.';

describe('troceado para el RAG (requisitos/03, apartado 4)', () => {
  it('una página corta es un solo fragmento con su número de página', () => {
    expect(
      chunkPages([{ page: 1, text: 'Artículo 1. La cooperativa se denomina San Isidro.' }]),
    ).toEqual([
      { index: 0, page: 1, content: 'Artículo 1. La cooperativa se denomina San Isidro.' },
    ]);
  });

  it('las páginas sin texto no generan fragmentos', () => {
    expect(
      chunkPages([
        { page: 1, text: '  \n ' },
        { page: 2, text: 'Texto' },
      ]),
    ).toEqual([{ index: 0, page: 2, content: 'Texto' }]);
  });

  it('ningún fragmento mezcla páginas (RN-DOC-06: cada uno lleva su página)', () => {
    const chunks = chunkPages([
      { page: 1, text: paragraph(150, 'a') },
      { page: 2, text: paragraph(150, 'b') },
    ]);

    for (const chunk of chunks) {
      const fromPage1 = chunk.content.includes('a1');
      const fromPage2 = chunk.content.includes('b1');
      expect(fromPage1 && fromPage2).toBe(false);
      expect(chunk.page).toBe(fromPage1 ? 1 : 2);
    }
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it('un texto largo se reparte en fragmentos de unas 800 unidades', () => {
    const chunks = chunkPages([
      { page: 1, text: [1, 2, 3, 4, 5, 6].map(() => paragraph(60)).join('\n\n') },
    ]);

    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(CHUNK_TARGET + CHUNK_OVERLAP);
    }
  });

  it('respeta los párrafos: uno que cabe no se parte', () => {
    const first = paragraph(40, 'uno');
    const second = paragraph(40, 'dos');
    const third = paragraph(40, 'tres');

    const chunks = chunkPages([{ page: 1, text: [first, second, third].join('\n\n') }]);

    for (const whole of [first, second, third]) {
      expect(chunks.some((chunk) => chunk.content.includes(whole))).toBe(true);
    }
  });

  it('los fragmentos consecutivos se solapan', () => {
    const chunks = chunkPages([{ page: 1, text: paragraph(400) }]);

    for (let i = 1; i < chunks.length; i++) {
      const previousTail = chunks[i - 1]!.content.split(' ').slice(-3).join(' ');
      expect(
        chunks[i]!.content.startsWith(previousTail) || chunks[i]!.content.includes(previousTail),
      ).toBe(true);
    }
  });

  it('un párrafo sin espacios se corta igualmente', () => {
    const chunks = chunkPages([{ page: 1, text: 'x'.repeat(2500) }]);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.content.length <= CHUNK_TARGET + CHUNK_OVERLAP)).toBe(true);
  });

  it('es determinista: el mismo texto da los mismos fragmentos', () => {
    const pages = [{ page: 1, text: [paragraph(80), paragraph(120)].join('\n\n') }];

    expect(chunkPages(pages)).toEqual(chunkPages(pages));
  });

  it('normaliza espacios y saltos de línea dentro de un párrafo', () => {
    expect(chunkPages([{ page: 3, text: 'Uno\r\ndos   tres\n cuatro' }])[0]?.content).toBe(
      'Uno dos tres cuatro',
    );
  });
});

describe('texto extraíble (HU-DOC-06)', () => {
  it('un PDF escaneado, sin texto, no es indexable', () => {
    expect(
      hasExtractableText([
        { page: 1, text: '' },
        { page: 2, text: ' \n' },
      ]),
    ).toBe(false);
    expect(hasExtractableText([{ page: 1, text: 'Hola' }])).toBe(true);
  });
});
