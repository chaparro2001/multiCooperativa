/**
 * How many of the query's distinct lexemes (stemmed, stopwords removed) a fragment must contain
 * to enter through the text arm (ADR-022): half of them rounded up, at least 2 when the query has
 * 2 or more, so one common word ("socio") cannot bring in a fragment on its own. A query of a
 * single lexeme (an exact term such as "quórum") needs just that one; none means no text arm.
 * The SQL of the text arm mirrors this rule; the integration tests check both agree.
 */
export function requiredTermMatches(lexemeCount: number): number {
  if (lexemeCount <= 0) return 0;
  if (lexemeCount === 1) return 1;
  return Math.max(2, Math.ceil(lexemeCount / 2));
}
