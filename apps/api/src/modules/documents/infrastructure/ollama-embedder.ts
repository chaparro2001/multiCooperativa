import {
  EMBEDDING_DIMENSIONS,
  type Embedder,
  EmbeddingUnavailableError,
} from '../application/ports/embedder';

/** Texts per request: large enough to be fast, small enough to keep each call short. */
export const BATCH_SIZE = 16;

/** One batch on a CPU-only host can take a while (the model may also need to load first). */
export const DEFAULT_EMBEDDING_TIMEOUT_MS = 120_000;

/** Ollama's HTTP API (`POST /api/embed`) with a local model, bge-m3 by default (ADR-006). */
export class OllamaEmbedder implements Embedder {
  constructor(
    private readonly settings: { url: string; model: string; timeoutMs?: number },
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      vectors.push(...(await this.batch(texts.slice(start, start + BATCH_SIZE))));
    }
    return vectors;
  }

  private async batch(input: string[]): Promise<number[][]> {
    let response: Response;
    try {
      response = await this.doFetch(`${this.settings.url.replace(/\/+$/, '')}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.settings.model, input }),
        signal: AbortSignal.timeout(this.settings.timeoutMs ?? DEFAULT_EMBEDDING_TIMEOUT_MS),
      });
    } catch (error) {
      throw new EmbeddingUnavailableError('Cannot connect to the embeddings service.', error);
    }
    if (!response.ok) {
      throw new EmbeddingUnavailableError(
        `The embeddings service responded ${response.status}. Is the model ${this.settings.model} downloaded?`,
      );
    }
    const { embeddings } = (await response.json()) as { embeddings?: number[][] };
    if (!embeddings || embeddings.length !== input.length) {
      throw new EmbeddingUnavailableError('Unexpected response from the embeddings service.');
    }
    if (embeddings.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)) {
      throw new EmbeddingUnavailableError(
        `Model ${this.settings.model} does not produce ${EMBEDDING_DIMENSIONS}-dimension vectors.`,
      );
    }
    return embeddings;
  }
}
