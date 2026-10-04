import {
  EMBEDDING_DIMENSIONS,
  type Embedder,
  EmbeddingUnavailableError,
} from '../application/ports/embedder';

/** Texts per request: large enough to be fast, small enough to keep each call short. */
export const BATCH_SIZE = 16;

/** Ollama's HTTP API (`POST /api/embed`) with a local model, bge-m3 by default (ADR-006). */
export class OllamaEmbedder implements Embedder {
  constructor(
    private readonly settings: { url: string; model: string },
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
      });
    } catch (error) {
      throw new EmbeddingUnavailableError(
        'No se puede conectar con el servicio de embeddings.',
        error,
      );
    }
    if (!response.ok) {
      throw new EmbeddingUnavailableError(
        `El servicio de embeddings respondió ${response.status}. ¿Está descargado el modelo ${this.settings.model}?`,
      );
    }
    const { embeddings } = (await response.json()) as { embeddings?: number[][] };
    if (!embeddings || embeddings.length !== input.length) {
      throw new EmbeddingUnavailableError('Respuesta inesperada del servicio de embeddings.');
    }
    if (embeddings.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)) {
      throw new EmbeddingUnavailableError(
        `El modelo ${this.settings.model} no genera vectores de ${EMBEDDING_DIMENSIONS} dimensiones.`,
      );
    }
    return embeddings;
  }
}
