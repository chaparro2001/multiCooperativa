import {
  callWithFallback,
  EMBEDDING_RESILIENCE,
  type ResilienceOptions,
} from '../../../shared/infrastructure/resilient-call';
import {
  EMBEDDING_DIMENSIONS,
  type Embedder,
  type EmbeddingKind,
  EmbeddingUnavailableError,
} from '../application/ports/embedder';

/** Texts per request: well inside the free-tier limits, small enough to keep each call short. */
export const BATCH_SIZE = 16;

/** The slice of `GoogleGenAI` this adapter uses; tests inject a fake (no network). */
export interface GeminiEmbeddingClient {
  models: {
    embedContent(params: {
      model: string;
      contents: string[];
      config?: { taskType?: string; outputDimensionality?: number };
    }): Promise<{ embeddings?: { values?: number[] }[] }>;
  };
}

/**
 * Gemini embeddings (ADR-010) for the hosted demo, where Ollama is not available.
 *
 * - `gemini-embedding-2` (default) has no task type: the role goes in a text prefix and
 *   it renormalizes reduced dimensions itself.
 * - `gemini-embedding-001` takes `taskType` and does not renormalize.
 *
 * Whatever the model, vectors are asked at 1024 dimensions to fit the `vector(1024)`
 * column and L2-normalized here, which is harmless when they already are.
 */
export class GeminiEmbedder implements Embedder {
  constructor(
    private readonly client: GeminiEmbeddingClient,
    private readonly model = 'gemini-embedding-2',
    private readonly resilience: Partial<ResilienceOptions> = {},
  ) {}

  async embed(texts: string[], kind: EmbeddingKind = 'document'): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      vectors.push(...(await this.batch(texts.slice(start, start + BATCH_SIZE), kind)));
    }
    return vectors;
  }

  private async batch(input: string[], kind: EmbeddingKind): Promise<number[][]> {
    const legacy = this.model.includes('embedding-001');
    const contents = legacy ? input : input.map((text) => withPrefix(text, kind));
    let response: Awaited<ReturnType<GeminiEmbeddingClient['models']['embedContent']>>;
    try {
      // Vectors of different models are not comparable: no fallback model here, only retries.
      response = await callWithFallback(
        [this.model],
        (model) =>
          this.client.models.embedContent({
            model,
            contents,
            config: {
              outputDimensionality: EMBEDDING_DIMENSIONS,
              ...(legacy && {
                taskType: kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
              }),
            },
          }),
        { ...EMBEDDING_RESILIENCE, ...this.resilience },
      );
    } catch (error) {
      throw new EmbeddingUnavailableError('Cannot reach the Gemini embeddings service.', error);
    }
    const embeddings = response.embeddings?.map((embedding) => embedding.values);
    if (!embeddings || embeddings.length !== input.length) {
      throw new EmbeddingUnavailableError(
        'Unexpected response from the Gemini embeddings service.',
      );
    }
    return embeddings.map((values) => {
      if (!values || values.length !== EMBEDDING_DIMENSIONS) {
        throw new EmbeddingUnavailableError(
          `Model ${this.model} does not produce ${EMBEDDING_DIMENSIONS}-dimension vectors.`,
        );
      }
      return normalize(values);
    });
  }
}

/** Prompt format that gemini-embedding-2 expects instead of a task type. */
function withPrefix(text: string, kind: EmbeddingKind): string {
  return kind === 'query' ? `task: search result | query: ${text}` : `title: none | text: ${text}`;
}

function normalize(values: number[]): number[] {
  const norm = Math.hypot(...values);
  return norm === 0 ? values : values.map((value) => value / norm);
}
