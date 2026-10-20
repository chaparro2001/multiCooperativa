import { describe, expect, it } from 'vitest';

import { buildPdf } from '../../../../test/pdf';
import { UnreadablePdfError } from '../application/ports/text-extractor';
import { UnpdfTextExtractor } from './unpdf-text-extractor';

const extractor = new UnpdfTextExtractor();

describe('PDF text extraction', () => {
  it('returns the text of each page with its number, accents included', async () => {
    const pdf = await buildPdf([
      ['Article 1. Name', 'The cooperative is named San Isidro.'],
      ['Article 2. Registered office', 'The registered office is in Cáceres.'],
    ]);

    const pages = await extractor.extract(pdf);

    expect(pages.map((p) => p.page)).toEqual([1, 2]);
    expect(pages[0]?.text).toContain('The cooperative is named San Isidro.');
    expect(pages[1]?.text).toContain('The registered office is in Cáceres.');
  });

  it('a page without a text layer comes back empty', async () => {
    const pages = await extractor.extract(await buildPdf([[]]));

    expect(pages).toEqual([{ page: 1, text: '' }]);
  });

  it('a file that cannot be read as a PDF fails with UnreadablePdfError', async () => {
    await expect(
      extractor.extract(new TextEncoder().encode('%PDF-1.4 broken')),
    ).rejects.toBeInstanceOf(UnreadablePdfError);
  });
});
