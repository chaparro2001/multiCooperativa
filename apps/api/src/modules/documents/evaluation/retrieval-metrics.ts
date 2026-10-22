import type { RetrievalCase } from './retrieval-cases';

/** What the benchmark needs from a returned fragment. */
export interface ReturnedFragment {
  title: string;
  page: number;
  /** The fragment's own text (never an expanded context). */
  content: string;
}

/** Lowercase, no accents, collapsed whitespace: the form passages are written in. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A fragment is right when it comes from the expected document and page and holds the passage. */
export function isExpected(fragment: ReturnedFragment, testCase: RetrievalCase): boolean {
  const content = normalizeText(fragment.content);
  return testCase.expected.some(
    (expected) =>
      fragment.title === expected.document &&
      fragment.page === expected.page &&
      content.includes(normalizeText(expected.passage)),
  );
}

/** 1-based position of the first right fragment, or null. */
export function firstHitRank(
  fragments: ReturnedFragment[],
  testCase: RetrievalCase,
): number | null {
  const index = fragments.findIndex((fragment) => isExpected(fragment, testCase));
  return index === -1 ? null : index + 1;
}

export interface CaseResult {
  testCase: RetrievalCase;
  fragments: ReturnedFragment[];
}

export interface RetrievalMetrics {
  answerable: number;
  unanswerable: number;
  hitAt1: number;
  hitAt5: number;
  mrr: number;
  /** Share of unanswerable questions that returned nothing. */
  noAnswerPrecision: number;
  /** Share of answerable questions that returned at least one fragment. */
  answeredShare: number;
}

const ratio = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);

/** hit@k and MRR over the answerable cases (rank beyond the top 5 counts as a miss). */
export function computeMetrics(results: CaseResult[]): RetrievalMetrics {
  const answerable = results.filter((r) => r.testCase.expected.length > 0);
  const unanswerable = results.filter((r) => r.testCase.expected.length === 0);
  const ranks = answerable.map((r) => firstHitRank(r.fragments.slice(0, 5), r.testCase));
  return {
    answerable: answerable.length,
    unanswerable: unanswerable.length,
    hitAt1: ratio(ranks.filter((rank) => rank === 1).length, answerable.length),
    hitAt5: ratio(ranks.filter((rank) => rank !== null).length, answerable.length),
    mrr: ratio(
      ranks.reduce<number>((sum, rank) => sum + (rank === null ? 0 : 1 / rank), 0),
      answerable.length,
    ),
    noAnswerPrecision: ratio(
      unanswerable.filter((r) => r.fragments.length === 0).length,
      unanswerable.length,
    ),
    answeredShare: ratio(
      answerable.filter((r) => r.fragments.length > 0).length,
      answerable.length,
    ),
  };
}
