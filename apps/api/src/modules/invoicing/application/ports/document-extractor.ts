/** Fields the model may flag as read with low confidence (US-INV-05). */
export const EXTRACTION_FIELDS = [
  'documentType',
  'thirdParty',
  'number',
  'date',
  'dueDate',
  'base',
  'vatRate',
  'total',
  'lines',
] as const;
export type ExtractionField = (typeof EXTRACTION_FIELDS)[number];

/** What the model reads, as printed: the use case normalizes and validates it. */
export interface RawExtraction {
  documentType: 'delivery_note' | 'invoice' | 'other';
  issuer: { nif: string | null; name: string | null };
  recipient: { nif: string | null; name: string | null };
  number: string | null;
  /** Delivery date of a note, issue date of an invoice. */
  date: string | null;
  dueDate: string | null;
  base: string | null;
  vatRate: string | null;
  total: string | null;
  lines: { concept: string; quantity: string; unit: string }[];
  lowConfidence: ExtractionField[];
}

export type ExtractableMediaType = 'application/pdf' | 'image/jpeg' | 'image/png';

/** Reads a delivery note or an invoice from a photo or a PDF (requirements/05, section 4). */
export interface DocumentExtractor {
  /** Null when nothing usable could be read (US-INV-05: then the form is filled by hand). */
  extract(file: {
    content: Uint8Array;
    mediaType: ExtractableMediaType;
  }): Promise<RawExtraction | null>;
}

/** The extraction service is down or not configured: 503, the form still works by hand. */
export class ExtractionUnavailableError extends Error {
  constructor(message = 'Automatic reading is not available at the moment.', cause?: unknown) {
    super(message, { cause });
    this.name = 'ExtractionUnavailableError';
  }
}
