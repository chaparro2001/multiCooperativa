/** Fixed by the `vector(1024)` column (ADR-006): a model with another size needs a migration. */
export const EMBEDDING_DIMENSIONS = 1024;

export type EmbeddingKind = 'document' | 'query';

/** Turns texts into vectors for semantic search (requirements/03, section 4, step 3). */
export interface Embedder {
  /**
   * One vector per text, in the same order. `kind` tells asymmetric models whether the
   * texts are fragments to index (default) or a search query; others ignore it.
   */
  embed(texts: string[], kind?: EmbeddingKind): Promise<number[][]>;
}

export class EmbeddingUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'EmbeddingUnavailableError';
  }
}
