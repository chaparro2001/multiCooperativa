import { createHash } from 'node:crypto';

import { EMBEDDING_DIMENSIONS, type Embedder } from '../ports/embedder';

/**
 * Deterministic stand-in for tests and CI (ADR-006): a normalized bag of words.
 * Texts sharing words are close, which is enough to test search and isolation.
 */
export class HashingEmbedder implements Embedder {
  calls = 0;

  async embed(texts: string[]): Promise<number[][]> {
    this.calls++;
    return texts.map((text) => {
      const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
      for (const word of text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .match(/\p{L}{3,}/gu) ?? []) {
        const bucket =
          createHash('sha256').update(word).digest().readUInt32BE(0) % EMBEDDING_DIMENSIONS;
        vector[bucket]! += 1;
      }
      const norm = Math.hypot(...vector) || 1;
      return vector.map((value) => value / norm);
    });
  }
}
