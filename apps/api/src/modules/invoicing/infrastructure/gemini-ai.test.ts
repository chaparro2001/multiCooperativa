import type { GoogleGenAI } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';

import { ExtractionUnavailableError } from '../application/ports/document-extractor';
import { GeminiDocumentExtractor, GeminiDiscrepancyExplainer } from './gemini-ai';

const reading = {
  documentType: 'invoice',
  issuer: { nif: 'B12345674', name: 'Southern Fertilizers' },
  recipient: { nif: 'F12345674', name: 'Farm' },
  number: 'F-1',
  date: '2026-10-05',
  dueDate: null,
  base: '100,00',
  vatRate: '21',
  total: '121,00',
  lines: [{ concept: 'NPK', quantity: '10', unit: 'kg' }],
  lowConfidence: ['dueDate'],
};

const clientReturning = (text: string | undefined) => {
  const generateContent = vi.fn(async () => ({ text }));
  return { client: { models: { generateContent } } as unknown as GoogleGenAI, generateContent };
};
const file = {
  content: new TextEncoder().encode('%PDF-1.4'),
  mediaType: 'application/pdf',
} as const;

describe('Gemini extractor (US-INV-05, NFR-INV-05)', () => {
  it('sends the document inline with a JSON schema and returns the validated reading', async () => {
    const { client, generateContent } = clientReturning(JSON.stringify(reading));

    const result = await new GeminiDocumentExtractor(client, 'm').extract(file);

    expect(result).toMatchObject({ documentType: 'invoice', number: 'F-1' });
    const call = generateContent.mock.calls[0] as unknown as [
      {
        model: string;
        config: { responseMimeType: string; responseJsonSchema: unknown };
        contents: unknown;
      },
    ];
    expect(call[0].model).toBe('m');
    expect(call[0].config.responseMimeType).toBe('application/json');
    expect(call[0].config.responseJsonSchema).toMatchObject({ type: 'object' });
    expect(JSON.stringify(call[0].contents)).toContain('"mimeType":"application/pdf"');
  });

  it('BR-INV-11: output that does not comply with the schema is discarded', async () => {
    expect(
      await new GeminiDocumentExtractor(
        clientReturning('{"documentType":"receipt"}').client,
      ).extract(file),
    ).toBeNull();
    expect(
      await new GeminiDocumentExtractor(clientReturning('not json').client).extract(file),
    ).toBeNull();
    expect(
      await new GeminiDocumentExtractor(clientReturning(undefined).client).extract(file),
    ).toBeNull();
  });
});

describe('Gemini explainer (BR-INV-12)', () => {
  it('returns the validated texts, or null when they cannot be used', async () => {
    const facts = [{ concept: 'a', unit: 'kg', deliveredQuantity: '1', invoicedQuantity: '2' }];

    expect(
      await new GeminiDiscrepancyExplainer(
        clientReturning('{"explanations":["Facturado de más."]}').client,
      ).explain(facts),
    ).toEqual(['Facturado de más.']);
    expect(
      await new GeminiDiscrepancyExplainer(clientReturning('{"x":1}').client).explain(facts),
    ).toBeNull();
  });
});

describe('Gemini overload resilience (ADR-009)', () => {
  const fast = { sleep: async () => undefined, onRetry: () => undefined };
  const overloaded = Object.assign(new Error('{"status":"UNAVAILABLE"}'), { status: 503 });
  const clientFailingFor = (...failing: string[]) => {
    const generateContent = vi.fn(async ({ model }: { model: string }) => {
      if (failing.includes(model)) throw overloaded;
      return { text: JSON.stringify(reading) };
    });
    return { client: { models: { generateContent } } as unknown as GoogleGenAI, generateContent };
  };

  it('the extractor falls back to the next model when the primary is overloaded', async () => {
    const { client, generateContent } = clientFailingFor('primary');

    const result = await new GeminiDocumentExtractor(client, 'primary', ['backup'], fast).extract(
      file,
    );

    expect(result?.number).toBe('F-1');
    expect(generateContent.mock.calls.at(-1)?.[0].model).toBe('backup');
  });

  it('the extractor reports unavailable once every model is overloaded', async () => {
    const { client } = clientFailingFor('primary', 'backup');

    await expect(
      new GeminiDocumentExtractor(client, 'primary', ['backup'], fast).extract(file),
    ).rejects.toBeInstanceOf(ExtractionUnavailableError);
  });

  it('the explainer retries and then answers; if all fail it returns null', async () => {
    const ok = clientFailingFor();
    ok.generateContent
      .mockRejectedValueOnce(overloaded)
      .mockResolvedValueOnce({ text: '{"explanations":["uno"]}' });
    expect(
      await new GeminiDiscrepancyExplainer(ok.client, 'primary', [], fast).explain([]),
    ).toEqual(['uno']);

    const down = clientFailingFor('primary');
    expect(
      await new GeminiDiscrepancyExplainer(down.client, 'primary', [], fast).explain([]),
    ).toBeNull();
  });
});
