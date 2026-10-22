import { describe, expect, it } from 'vitest';

import { CHUNK_OVERLAP, CHUNK_TARGET, chunkPages, hasExtractableText } from './chunking';

const paragraph = (words: number, seed = 'palabra') =>
  Array.from({ length: words }, (_, i) => `${seed}${i}`).join(' ') + '.';

describe('chunking for the RAG (requirements/03, section 4)', () => {
  it('a short page is a single fragment with its page number', () => {
    expect(
      chunkPages([{ page: 1, text: 'Article 1. The cooperative is named San Isidro.' }]),
    ).toEqual([
      {
        index: 0,
        page: 1,
        content: 'Article 1. The cooperative is named San Isidro.',
        section: null,
      },
    ]);
  });

  it('pages without text produce no fragments', () => {
    expect(
      chunkPages([
        { page: 1, text: '  \n ' },
        { page: 2, text: 'Texto' },
      ]),
    ).toEqual([{ index: 0, page: 2, content: 'Texto', section: null }]);
  });

  it('no fragment mixes pages (BR-DOC-06: each carries its page)', () => {
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

  it('a long text is split into fragments of about 800 units', () => {
    const chunks = chunkPages([
      { page: 1, text: [1, 2, 3, 4, 5, 6].map(() => paragraph(60)).join('\n\n') },
    ]);

    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(CHUNK_TARGET + CHUNK_OVERLAP);
    }
  });

  it('respects paragraphs: one that fits is not split', () => {
    const first = paragraph(40, 'uno');
    const second = paragraph(40, 'dos');
    const third = paragraph(40, 'tres');

    const chunks = chunkPages([{ page: 1, text: [first, second, third].join('\n\n') }]);

    for (const whole of [first, second, third]) {
      expect(chunks.some((chunk) => chunk.content.includes(whole))).toBe(true);
    }
  });

  it('consecutive fragments overlap', () => {
    const chunks = chunkPages([{ page: 1, text: paragraph(400) }]);

    for (let i = 1; i < chunks.length; i++) {
      const previousTail = chunks[i - 1]!.content.split(' ').slice(-3).join(' ');
      expect(
        chunks[i]!.content.startsWith(previousTail) || chunks[i]!.content.includes(previousTail),
      ).toBe(true);
    }
  });

  it('a paragraph without spaces is still cut', () => {
    const chunks = chunkPages([{ page: 1, text: 'x'.repeat(2500) }]);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.content.length <= CHUNK_TARGET + CHUNK_OVERLAP)).toBe(true);
  });

  it('is deterministic: the same text gives the same fragments', () => {
    const pages = [{ page: 1, text: [paragraph(80), paragraph(120)].join('\n\n') }];

    expect(chunkPages(pages)).toEqual(chunkPages(pages));
  });

  it('normalizes spaces and line breaks within a paragraph', () => {
    expect(chunkPages([{ page: 3, text: 'One\r\ntwo   three\n four' }])[0]?.content).toBe(
      'One two three four',
    );
  });
});

describe('structure-aware chunking (ADR-023)', () => {
  const article = (n: number, words = 20) => `Artículo ${n}. ${paragraph(words, `art${n}x`)}`;
  const page = (...lines: string[]) => ({ page: 1, text: lines.join('\n') });

  it('never splits an article that fits: each one is whole in some fragment', () => {
    const articles = Array.from({ length: 12 }, (_, i) => article(i + 1, 25));

    const chunks = chunkPages([page(...articles)]);

    expect(chunks.length).toBeGreaterThan(1);
    for (const whole of articles) {
      expect(chunks.some((chunk) => chunk.content.includes(whole))).toBe(true);
    }
    expect(chunks.every((chunk) => chunk.content.length <= CHUNK_TARGET + CHUNK_OVERLAP)).toBe(
      true,
    );
  });

  it('carries the heading path and the articles of each fragment as its section', () => {
    const chunks = chunkPages([
      page('TÍTULO IV. RÉGIMEN ECONÓMICO', 'CAPÍTULO II. FONDOS', article(25, 10), article(26, 10)),
    ]);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.section).toBe(
      'TÍTULO IV. RÉGIMEN ECONÓMICO > CAPÍTULO II. FONDOS > Artículo 25-26',
    );
  });

  it('keeps the section across pages and resets deeper levels with a new heading', () => {
    const chunks = chunkPages([
      { page: 1, text: ['TÍTULO I. UNO', 'CAPÍTULO I. A', article(1, 10)].join('\n') },
      { page: 2, text: [article(2, 10), 'CAPÍTULO II. B', article(3, 10)].join('\n') },
    ]);

    expect(chunks.map((c) => c.section)).toEqual([
      'TÍTULO I. UNO > CAPÍTULO I. A > Artículo 1',
      'TÍTULO I. UNO > CAPÍTULO I. A > Artículo 2',
      'TÍTULO I. UNO > CAPÍTULO II. B > Artículo 3',
    ]);
  });

  it('a heading is never left alone at the end of a fragment', () => {
    const chunks = chunkPages([page(article(1, 100), 'CAPÍTULO II. FONDOS', article(2, 30))]);

    for (const chunk of chunks) {
      expect(chunk.content.trimEnd().endsWith('CAPÍTULO II. FONDOS')).toBe(false);
    }
    expect(chunks[chunks.length - 1]?.content).toContain('CAPÍTULO II. FONDOS');
  });

  it('an article larger than the target is split by sentences, with overlap, in the same section', () => {
    const long = `Artículo 9. ${Array.from({ length: 40 }, (_, i) => `Frase número ${i} del artículo largo.`).join(' ')}`;

    const chunks = chunkPages([page('TÍTULO I. UNO', long)]);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.section?.startsWith('TÍTULO I. UNO > Artículo 9'))).toBe(true);
    expect(chunks.every((c) => c.content.length <= CHUNK_TARGET + CHUNK_OVERLAP)).toBe(true);
  });

  it('removes running headers and page numbers repeated across pages', () => {
    const chunks = chunkPages([
      { page: 1, text: 'REGLAMENTO INTERIOR\nArtículo 1. Uno.\nPágina 1' },
      { page: 2, text: 'REGLAMENTO INTERIOR\nArtículo 2. Dos.\nPágina 2' },
    ]);

    expect(chunks.map((c) => c.content)).toEqual(['Artículo 1. Uno.', 'Artículo 2. Dos.']);
  });
});

describe('extractable text (US-DOC-06)', () => {
  it('a scanned PDF, without text, is not indexable', () => {
    expect(
      hasExtractableText([
        { page: 1, text: '' },
        { page: 2, text: ' \n' },
      ]),
    ).toBe(false);
    expect(hasExtractableText([{ page: 1, text: 'Hola' }])).toBe(true);
  });
});
