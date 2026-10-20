import type { PageText } from '../../domain/chunking';

/** Text of a PDF, page by page (requirements/03, section 4, step 1). */
export interface PdfTextExtractor {
  /** Throws UnreadablePdfError when the file cannot be parsed as a PDF. */
  extract(pdf: Uint8Array): Promise<PageText[]>;
}

export class UnreadablePdfError extends Error {
  constructor(cause: unknown) {
    super('The PDF could not be read.', { cause });
    this.name = 'UnreadablePdfError';
  }
}
