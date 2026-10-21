import { extractText } from 'unpdf';
import { describe, expect, it } from 'vitest';

import { buildSamplePdf, SAMPLE_DOCUMENTS, sampleInvoicing } from './sample-content';

describe('sample documents of the hosted demo', () => {
  it.each(SAMPLE_DOCUMENTS)('$title is a PDF with extractable text', async (document) => {
    const bytes = await buildSamplePdf(document);

    const { text } = await extractText(bytes, { mergePages: false });

    expect(text.length).toBeGreaterThan(0);
    expect(text.join(' ')).toContain(document.paragraphs[1]!.split(' ').slice(0, 3).join(' '));
  });
});

describe('sampleInvoicing (BR-INV-16)', () => {
  it('builds a delivery note 34 days old and an invoice due in 5 days, relative to today', () => {
    const sample = sampleInvoicing('2026-10-21');
    expect(sample.note.date).toBe('2026-09-17');
    expect(sample.invoice.dueDate).toBe('2026-10-26');
    expect(sample.invoice.issueDate <= sample.invoice.dueDate).toBe(true);
    expect(sample.invoice.total).toBe('1210.00');
  });
});
