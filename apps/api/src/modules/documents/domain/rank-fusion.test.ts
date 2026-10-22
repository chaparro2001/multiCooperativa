import { describe, expect, it } from 'vitest';

import { fuseRankings, reciprocalRankFusion, RRF_K } from './rank-fusion';

describe('reciprocal rank fusion (US-DOC-07, US-AI-02)', () => {
  it('Given a candidate in both arms, then it adds 1/(k+rank) of each', () => {
    expect(reciprocalRankFusion({ vectorRank: 1, textRank: 3 })).toBeCloseTo(
      1 / (RRF_K + 1) + 1 / (RRF_K + 3),
    );
  });

  it('Given a candidate in one arm only, then only that arm counts', () => {
    expect(reciprocalRankFusion({ vectorRank: null, textRank: 2 })).toBeCloseTo(1 / (RRF_K + 2));
    expect(reciprocalRankFusion({ vectorRank: null, textRank: null })).toBe(0);
  });

  it('Given a hit in both arms and a better-ranked hit in one, then agreement wins', () => {
    const both = { id: 'both', vectorRank: 2, textRank: 2 };
    const vectorOnly = { id: 'vector', vectorRank: 1, textRank: null };
    const textOnly = { id: 'text', vectorRank: null, textRank: 1 };

    expect(fuseRankings([vectorOnly, textOnly, both], 3).map((c) => c.id)).toEqual([
      'both',
      'vector',
      'text',
    ]);
  });

  it('keeps `limit` candidates and breaks ties by input order', () => {
    const a = { id: 'a', vectorRank: 1, textRank: null };
    const b = { id: 'b', vectorRank: null, textRank: 1 };
    const c = { id: 'c', vectorRank: 2, textRank: null };

    expect(fuseRankings([b, a, c], 2).map((x) => x.id)).toEqual(['b', 'a']);
    expect(fuseRankings([], 5)).toEqual([]);
  });
});
