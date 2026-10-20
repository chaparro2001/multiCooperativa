import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

import {
  type DocumentExtractor,
  type ExtractableMediaType,
  EXTRACTION_FIELDS,
  ExtractionUnavailableError,
  type RawExtraction,
} from '../application/ports/document-extractor';

/** ADR-007: low effort; extracting and explaining need no deep reasoning, and it keeps latency down. */
export const CLAUDE_MODEL = 'claude-opus-5-5';

/** What the model returns. Numbers stay as printed; the use case normalizes and validates them. */
const extractionSchema = z.object({
  documentType: z.enum(['delivery_note', 'invoice', 'other']),
  issuer: z.object({ nif: z.string().nullable(), name: z.string().nullable() }),
  recipient: z.object({ nif: z.string().nullable(), name: z.string().nullable() }),
  number: z.string().nullable(),
  date: z.string().nullable(),
  dueDate: z.string().nullable(),
  base: z.string().nullable(),
  vatRate: z.string().nullable(),
  total: z.string().nullable(),
  lines: z.array(z.object({ concept: z.string(), quantity: z.string(), unit: z.string() })),
  lowConfidence: z.array(z.enum(EXTRACTION_FIELDS)),
});

const EXTRACTION_INSTRUCTIONS = `Read this Spanish commercial document and return its data.

- documentType: "delivery_note" for a delivery note, "invoice" for an invoice, and "other" if it is neither or cannot be read.
- issuer: who issues the document (usually in the header); recipient: who it is addressed to. For each, the NIF or CIF exactly as printed and the company name.
- number: the delivery note or invoice number.
- date: the delivery note date or the invoice issue date; dueDate: the due date if present. Both as YYYY-MM-DD.
- base (taxable base), vatRate (VAT rate in %) and total: exactly as printed.
- lines: each line with concept, quantity and unit (kg, l, ud, t...). If a line has no unit, use "ud".
- Use null when a value does not appear. Do not invent or compute values that are not in the document.
- lowConfidence: the fields you read with doubts (blurry, handwritten, cut off or ambiguous text).`;

const toBase64 = (content: Uint8Array) => Buffer.from(content).toString('base64');

/**
 * Claude with vision and structured output (ADR-007). Only the document is
 * sent; nothing about the cooperative. Server-side fallbacks retry a declined
 * request on another model within the same call.
 */
export class ClaudeDocumentExtractor implements DocumentExtractor {
  constructor(private readonly client: Anthropic) {}

  async extract(file: {
    content: Uint8Array;
    mediaType: ExtractableMediaType;
  }): Promise<RawExtraction | null> {
    const data = toBase64(file.content);
    const document =
      file.mediaType === 'application/pdf'
        ? {
            type: 'document' as const,
            source: { type: 'base64' as const, media_type: file.mediaType, data },
          }
        : {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: file.mediaType, data },
          };

    try {
      const response = await this.client.beta.messages.parse({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: betaZodOutputFormat(extractionSchema) },
        messages: [
          { role: 'user', content: [document, { type: 'text', text: EXTRACTION_INSTRUCTIONS }] },
        ],
      });
      // Refused by the whole fallback chain, or cut off: nothing reliable to propose.
      if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;
      return response.parsed_output ?? null;
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new ExtractionUnavailableError(undefined, error);
      }
      throw error;
    }
  }
}

/** Without ANTHROPIC_API_KEY the form still works by hand (ADR-007). */
export class UnavailableDocumentExtractor implements DocumentExtractor {
  async extract(): Promise<RawExtraction | null> {
    throw new ExtractionUnavailableError('Automatic reading is not configured on this server.');
  }
}

/** One client per process; a short timeout and one retry keep extraction near 15 s (NFR-INV-01). */
export function createClaudeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
}
