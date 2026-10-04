import { extractText } from 'unpdf';

import { type PdfTextExtractor, UnreadablePdfError } from '../application/ports/text-extractor';
import type { PageText } from '../domain/chunking';

/** pdf.js under the hood: reads the text layer; scanned pages come back empty. */
export class UnpdfTextExtractor implements PdfTextExtractor {
  async extract(pdf: Uint8Array): Promise<PageText[]> {
    try {
      // pdf.js takes ownership of the buffer it receives: pass a copy.
      const { text } = await extractText(new Uint8Array(pdf), { mergePages: false });
      return text.map((pageText, i) => ({ page: i + 1, text: pageText }));
    } catch (error) {
      throw new UnreadablePdfError(error);
    }
  }
}
