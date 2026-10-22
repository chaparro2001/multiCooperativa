import { describe, expect, it } from 'vitest';

import { diversify } from './diversity';

const hit = (documentId: string, n: number) => ({ documentId, n });

describe('per-document diversity (ADR-023)', () => {
  it('lets a document take at most two places when other documents are available', () => {
    const ranked = [hit('a', 1), hit('a', 2), hit('a', 3), hit('b', 1), hit('c', 1), hit('a', 4)];

    expect(diversify(ranked, 5).map((h) => `${h.documentId}${h.n}`)).toEqual([
      'a1',
      'a2',
      'b1',
      'c1',
      'a3',
    ]);
  });

  it('keeps the ranking order of what it returns', () => {
    const ranked = [hit('a', 1), hit('b', 1), hit('a', 2), hit('a', 3), hit('c', 1)];

    expect(diversify(ranked, 4).map((h) => `${h.documentId}${h.n}`)).toEqual([
      'a1',
      'b1',
      'a2',
      'c1',
    ]);
  });

  it('is soft: a single relevant document still fills the result', () => {
    const ranked = [1, 2, 3, 4, 5, 6].map((n) => hit('a', n));

    expect(diversify(ranked, 5)).toHaveLength(5);
  });
});
