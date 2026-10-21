import { ApiError, GoogleGenAI } from '@google/genai';
import { z } from 'zod';

import {
  callWithFallback,
  isTransientError,
  modelChain,
  type ResilienceOptions,
} from '../../../shared/infrastructure/resilient-call';
import type {
  DiscrepancyExplainer,
  DiscrepancyFact,
} from '../application/ports/discrepancy-explainer';
import {
  type DocumentExtractor,
  type ExtractableMediaType,
  EXTRACTION_FIELDS,
  ExtractionUnavailableError,
  type RawExtraction,
} from '../application/ports/document-extractor';

/** Flash-class model with a free tier (ADR-009); overridable with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

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

const explanationSchema = z.object({ explanations: z.array(z.string()) });

const EXTRACTION_INSTRUCTIONS = `Read this Spanish commercial document and return its data.

- documentType: "delivery_note" for a delivery note, "invoice" for an invoice, and "other" if it is neither or cannot be read.
- issuer: who issues the document (usually in the header); recipient: who it is addressed to. For each, the NIF or CIF exactly as printed and the company name.
- number: the delivery note or invoice number.
- date: the delivery note date or the invoice issue date; dueDate: the due date if present. Both as YYYY-MM-DD.
- base (taxable base), vatRate (VAT rate in %) and total: exactly as printed.
- lines: each line with concept, quantity and unit (kg, l, ud, t...). If a line has no unit, use "ud".
- Use null when a value does not appear. Do not invent or compute values that are not in the document.
- lowConfidence: the fields you read with doubts (blurry, handwritten, cut off or ambiguous text).`;

const EXPLANATION_INSTRUCTIONS = `You help a farming cooperative's back office. Below is a JSON list of items where the quantity billed on an invoice differs from the quantity on the delivery notes.

For each item, in the same order, write ONE short sentence in Spanish (at most 25 words) that says plainly what the difference is and what is worth checking (e.g. billed more than delivered, an item billed that was never delivered, a unit mismatch). Use only the data given: do not invent reasons, prices or names. Return exactly one sentence per item.`;

/** The structured-output contract is the Zod schema itself, as JSON Schema. */
const jsonConfig = (schema: z.ZodType) => ({
  responseMimeType: 'application/json',
  responseJsonSchema: z.toJSONSchema(schema),
  temperature: 0,
});

/**
 * Gemini with vision and JSON output (ADR-009). Only the document is sent, nothing about
 * the cooperative. The reply is validated again with the Zod schema: whatever does not
 * comply is discarded and the form is filled in by hand.
 */
export class GeminiDocumentExtractor implements DocumentExtractor {
  constructor(
    private readonly client: GoogleGenAI,
    private readonly model: string = DEFAULT_GEMINI_MODEL,
    private readonly fallbackModels: readonly string[] = [],
    private readonly resilience: Partial<ResilienceOptions> = {},
  ) {}

  async extract(file: {
    content: Uint8Array;
    mediaType: ExtractableMediaType;
  }): Promise<RawExtraction | null> {
    try {
      const contents = [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: file.mediaType,
                data: Buffer.from(file.content).toString('base64'),
              },
            },
            { text: EXTRACTION_INSTRUCTIONS },
          ],
        },
      ];
      const response = await callWithFallback(
        modelChain(this.model, this.fallbackModels),
        (model) =>
          this.client.models.generateContent({
            model,
            contents,
            config: jsonConfig(extractionSchema),
          }),
        this.resilience,
      );
      return parseJson(response.text, extractionSchema);
    } catch (error) {
      if (error instanceof ApiError || isTransientError(error))
        throw new ExtractionUnavailableError(undefined, error);
      throw error;
    }
  }
}

/** Gemini drafts the plain-language explanation; the numeric rule decides the discrepancy (BR-INV-12). */
export class GeminiDiscrepancyExplainer implements DiscrepancyExplainer {
  constructor(
    private readonly client: GoogleGenAI,
    private readonly model: string = DEFAULT_GEMINI_MODEL,
    private readonly fallbackModels: readonly string[] = [],
    private readonly resilience: Partial<ResilienceOptions> = {},
  ) {}

  async explain(facts: DiscrepancyFact[]): Promise<string[] | null> {
    try {
      const contents = `${EXPLANATION_INSTRUCTIONS}\n\n${JSON.stringify(facts)}`;
      const response = await callWithFallback(
        modelChain(this.model, this.fallbackModels),
        (model) =>
          this.client.models.generateContent({
            model,
            contents,
            config: jsonConfig(explanationSchema),
          }),
        this.resilience,
      );
      return parseJson(response.text, explanationSchema)?.explanations ?? null;
    } catch (error) {
      if (error instanceof ApiError || isTransientError(error)) return null;
      throw error;
    }
  }
}

/** JSON text → value validated against the schema; null if it is empty, not JSON or does not comply. */
export function parseJson<T extends z.ZodType>(
  text: string | undefined,
  schema: T,
): z.infer<T> | null {
  if (!text) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Without GEMINI_API_KEY the form still works by hand (ADR-009). */
export class UnavailableDocumentExtractor implements DocumentExtractor {
  async extract(): Promise<RawExtraction | null> {
    throw new ExtractionUnavailableError('Automatic reading is not configured on this server.');
  }
}

/** Without GEMINI_API_KEY the explanations stay empty. */
export class UnavailableDiscrepancyExplainer implements DiscrepancyExplainer {
  async explain(): Promise<string[] | null> {
    return null;
  }
}

/** One client per process; the key lives only in the backend (NFR-INV-05). */
export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: 30_000 } });
}
