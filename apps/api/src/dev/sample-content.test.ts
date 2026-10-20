import { extractText } from 'unpdf';
import { describe, expect, it } from 'vitest';

import { buildSamplePdf, SAMPLE_DOCUMENTS } from './sample-content';

describe('sample documents of the hosted demo', () => {
  it.each(SAMPLE_DOCUMENTS)('$title is a PDF with extractable text', async (document) => {
    const bytes = await buildSamplePdf(document);

    const { text } = await extractText(bytes, { mergePages: false });

    expect(text.length).toBeGreaterThan(0);
    expect(text.join(' ')).toContain(document.paragraphs[1]!.split(' ').slice(0, 3).join(' '));
  });
});
