# ADR-022: Hybrid retrieval and minimum similarity threshold

**Date**: 2026-10-22

**Status**: Accepted

## Context

Document search (US-DOC-07) and the assistant's `search_documents` tool (BR-AI-04, BR-AI-05) used only exact cosine search over the embeddings ([ADR-006](ADR-006-local-model-embeddings.md)). Three problems:

- A query with a rare exact term (a form number, a surname, an article number) can miss the fragment that contains it, because embeddings capture meaning, not spelling.
- Cosine search always returns the nearest fragments, however far: an off-topic question gets "relevant" fragments, which the model may then cite.
- The endpoint asked for 10 fragments while the tool only gave 5 to the model: two constants for the same thing.

## Options Considered

1. **Keep vector-only search**: simple, but has the first two problems.
2. **Add a cross-encoder reranker** (for example `bge-reranker`): better precision, but it needs another model served on CPU. Scoring 20 candidates per question adds seconds on the target home server, which already runs the chat model; rejected for latency and memory.
3. **Hybrid: vector arm plus full-text arm in PostgreSQL, fused with Reciprocal Rank Fusion (RRF)** and a minimum similarity on the vector arm. No new dependency or service.
4. **An HNSW index**: not needed. Search is filtered by cooperative first (exact scan of that cooperative's chunks), which is fast at this size and keeps the result complete; the ADR-006 note (consider HNSW past about 100k chunks per cooperative, an estimate) still stands.

## Decision

Options considered for stopping the text arm from bypassing the threshold: **A** term coverage, **B** a lower cosine floor for text hits, **C** a minimum `ts_rank_cd` (rejected: the rank is not normalized, its scale depends on fragment length and the query, so no value means the same thing across queries) and **D** weighting terms by inverse document frequency to ignore common words (rejected for now: needs corpus statistics per cooperative that must be kept in sync, too costly for the benefit). A and B are adopted, together.

Option 3.

- **Full-text arm.** `DocumentChunk."contentTsv"` is a stored generated column, `to_tsvector('spanish', content)`, with a GIN index (migration `20261022170000_document_chunk_fulltext`). Being generated, the raw INSERTs of the indexer do not change and existing rows are filled by the migration. In `schema.prisma` it is an `Unsupported("tsvector")?` field with `@default(dbgenerated(...))` and `@@index(type: Gin)`, so `prisma migrate` sees no drift. The query terms are combined with OR (`plainto_tsquery` ANDs them, and a natural-language question would match nothing): `replace(plainto_tsquery('spanish', $text)::text, '&', '|')::tsquery`. The text is a bound parameter and the database builds the tsquery, so any user text is safe; a query of only stopwords gives an empty tsquery that matches nothing. Ranked with `ts_rank_cd`.
- **Vector arm.** Unchanged (exact cosine), but candidates below a minimum cosine similarity are dropped.
- **Same isolation filter in both arms** (`cooperativeId` on chunk and document, document published), inside one SQL statement with two CTEs of 20 candidates each (NFR-DOC-03, BR-AI-04).
- **Fusion.** RRF with k = 60 (`domain/rank-fusion.ts`, a pure function with unit tests): the sum of `1 / (60 + rank)` over the arms. It uses ranks only, so the incomparable cosine and `ts_rank_cd` scales are never mixed. SQL returns each candidate with its rank per arm; the domain fuses and cuts to `limit`.
- **Score.** `FragmentHit.score` stays the cosine similarity, computed for every returned hit, including those found only by the text arm.
- **Text-arm guards.** The text arm alone could bypass the threshold: one common word ("socio", "cooperativa") shared with a fragment would bring it in whatever its meaning. Two guards, both over candidates already selected by the GIN index:
  - **Term coverage (A).** A fragment must contain at least `ceil(50%)` of the distinct lexemes of the query (stemmed, stopwords dropped, from `tsvector_to_array(to_tsvector('spanish', $text))`), and at least 2 when the query has 2 or more; a single lexeme needs 1 (`requiredTermMatches` in `domain/term-coverage.ts`, with `it.each` tests; the SQL mirrors it and the integration tests check both). "edad mínima para ser socio" (edad, mínim, soci) needs 2, "artículo 14" needs 2, "quórum" needs 1. Matches are counted by intersecting the fragment's lexemes with the query's, so no tsquery is built from user text.
  - **Similarity floor (B).** A text hit must also reach `EMBEDDING_TEXT_MIN_SCORE` cosine, at most the vector threshold (an explicit value above it is rejected in `env.ts`; the default is capped at it): a fragment that shares terms but is unrelated in meaning is dropped.
- **Threshold.** Applies to the vector arm only: an exact term match is evidence by itself and is kept. Scores are not comparable between models, so the default depends on `EMBEDDINGS_PROVIDER` and `EMBEDDING_MIN_SCORE` (0..1) overrides it. It travels through deps (`createApi({ embeddingMinScore })` to the `PgVectorFragmentIndex` options), not through a global.
- **Limit.** `SEARCH_RESULTS = 5` in the documents module is the single source: the endpoint returns it and the assistant tool re-exports it (`DOCUMENT_SEARCH_RESULTS`) to cap what it hands to the model.
- The `FragmentIndex.search` port now takes `{ text, embedding }`.

### Threshold values

| Provider | Model                | Default  | How                                                                                                                                                                                                                                                                                                                                                            |
| -------- | -------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ollama` | `bge-m3`             | **0.40** | Measured locally with the three sample documents (5 fragments, `src/dev/sample-content.ts`) and 20 queries in Spanish: 10 relevant questions reached 0.48 to 0.66 with their best fragment (their third-best 0.31 to 0.48); 10 off-topic ones reached 0.24 to 0.42 (median about 0.34). 0.40 removes most of the noise and keeps every best relevant fragment. |
| `gemini` | `gemini-embedding-2` | **0.30** | **Not calibrated**: no paid or free-tier calls were made for this decision. A conservative low value that filters little; measure with real documents and set `EMBEDDING_MIN_SCORE`.                                                                                                                                                                           |

Text-arm floor (`EMBEDDING_TEXT_MIN_SCORE`):

| Provider            | Default  | How                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ollama` (`bge-m3`) | **0.30** | Same sample documents, 18 queries against all 5 fragments. Off-topic questions (football, capital of France, bitcoin) scored 0.18 to 0.32 against every fragment; relevant questions reached 0.41 to 0.66 with their best fragment, including the exact-term ones ("quórum" 0.43, "artículo 14" 0.41). 0.30 drops the clearly unrelated and keeps all relevant ones. |
| `gemini`            | **0.25** | **Not calibrated**; lower than its vector default (0.30) so it filters little.                                                                                                                                                                                                                                                                                       |

The bge-m3 calibration used a very small corpus, so it is indicative, not statistically solid. A higher threshold risks hiding borderline relevant fragments from the assistant; a lower one lets noise through. Text matches are not affected by either.

## Consequences

- Exact terms are found and off-topic questions return fewer or no fragments, so the assistant can say it found nothing (BR-AI-05).
- One more column and index on `DocumentChunk` (small: it is derived text). Stemming is Spanish-only; documents in other languages still work through the vector arm.
- The evaluation set of the assistant (`ai:eval`) uses canned sources, so it does not measure this retrieval; a retrieval-quality benchmark against labelled questions remains future work.
- Changing the embeddings provider requires reindexing (ADR-010) and reviewing `EMBEDDING_MIN_SCORE`.
