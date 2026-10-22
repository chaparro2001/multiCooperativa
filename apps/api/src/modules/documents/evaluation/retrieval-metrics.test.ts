import { describe, expect, it } from 'vitest';

import { RETRIEVAL_CASES, type RetrievalCase } from './retrieval-cases';
import { computeMetrics, firstHitRank, isExpected, normalizeText } from './retrieval-metrics';

const answerable: RetrievalCase = {
  id: 't1',
  kind: 'literal',
  question: 'q',
  expected: [{ document: 'Doc', page: 2, passage: 'cuatro anos' }],
};
const none: RetrievalCase = { id: 't2', kind: 'no-answer', question: 'q', expected: [] };

const fragment = (title: string, page: number, content: string) => ({ title, page, content });

describe('NFR-DOC-05 retrieval benchmark: metrics', () => {
  it('normalizes accents, case and whitespace', () => {
    expect(normalizeText('  Su MANDATO\n dura  cuatro años ')).toBe('su mandato dura cuatro anos');
  });

  it.each([
    ['right document, page and passage', fragment('Doc', 2, 'dura cuatro AÑOS.'), true],
    ['wrong document', fragment('Other', 2, 'dura cuatro años'), false],
    ['wrong page', fragment('Doc', 1, 'dura cuatro años'), false],
    ['passage missing', fragment('Doc', 2, 'dura tres años'), false],
  ])('judges a fragment: %s', (_name, returned, expected) => {
    expect(isExpected(returned, answerable)).toBe(expected);
  });

  it('gives the 1-based rank of the first right fragment', () => {
    const fragments = [fragment('Doc', 1, 'x'), fragment('Doc', 2, 'cuatro años')];
    expect(firstHitRank(fragments, answerable)).toBe(2);
    expect(firstHitRank([fragment('Doc', 1, 'x')], answerable)).toBeNull();
  });

  it('computes hit@1, hit@5, MRR and the no-answer precision', () => {
    const right = fragment('Doc', 2, 'cuatro años');
    const wrong = fragment('Doc', 1, 'otra cosa');
    const metrics = computeMetrics([
      { testCase: answerable, fragments: [right] },
      { testCase: { ...answerable, id: 'a2' }, fragments: [wrong, right] },
      { testCase: { ...answerable, id: 'a3' }, fragments: [wrong] },
      { testCase: { ...answerable, id: 'a4' }, fragments: [] },
      { testCase: none, fragments: [] },
      { testCase: { ...none, id: 'n2' }, fragments: [wrong] },
    ]);
    expect(metrics).toMatchObject({
      answerable: 4,
      unanswerable: 2,
      hitAt1: 0.25,
      hitAt5: 0.5,
      mrr: (1 + 0.5) / 4,
      noAnswerPrecision: 0.5,
      answeredShare: 0.75,
    });
  });

  it('the golden set has unique ids and enough cases of every kind', () => {
    const ids = RETRIEVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(RETRIEVAL_CASES.filter((c) => c.kind === 'no-answer').length).toBeGreaterThanOrEqual(5);
    expect(RETRIEVAL_CASES.length).toBeGreaterThanOrEqual(30);
  });
});
