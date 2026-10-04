/** Fixed by the `vector(1024)` column (ADR-006): a model with another size needs a migration. */
export const EMBEDDING_DIMENSIONS = 1024;

/** Turns texts into vectors for semantic search (requisitos/03, section 4, step 3). */
export interface Embedder {
  /** One vector per text, in the same order. */
  embed(texts: string[]): Promise<number[][]>;
}

export class EmbeddingUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'EmbeddingUnavailableError';
  }
}
