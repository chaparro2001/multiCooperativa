# ADR-023: RAG quality: retrieval benchmark, accent-insensitive text search, structure-aware chunking with contextual headers, neighbour expansion

**Date**: 2026-10-22

**Status**: Accepted. Supersedes the parts of [ADR-022](ADR-022-hybrid-retrieval-and-similarity-threshold.md) it names below (the full-text configuration, the content of the tsvector, the default Gemini thresholds and the fragment size and overlap of ADR-006's chunking); the rest of ADR-022 (hybrid search, RRF, term coverage, similarity floor) stands.

## Context

ADR-022 left "a retrieval-quality benchmark against labelled questions" as future work, and its thresholds were calibrated on 5 fragments and 20 queries by eye. Every improvement to the retrieval was therefore unmeasured. Known weaknesses seen in the extracted text:

- The text arm is accent-sensitive: "quorum" does not find "quórum"; sample and real documents are often typed without accents.
- PDF extraction keeps hard line breaks but no blank lines between paragraphs, so the paragraph-respecting chunker saw a page as one paragraph and cut it by sentences: articles were split, a heading ended a fragment, running headers and "Página N" footers ended up inside the fragments.
- A fragment says "the quorum is half plus one" without saying from which document or article.
- A single long document could take every place of the top 5, and a short or cut fragment gave the model too little context.

## Decision

**1. Retrieval benchmark (NFR-DOC-05).** `pnpm --filter @multicooperativa/api rag:eval` runs the real pipeline (stored PDF, unpdf, chunking, embeddings, pgvector hybrid search) over a corpus and a golden set kept in `modules/documents/evaluation/`:

- Corpus: the 3 sample documents of `db:seed:content` (5 fragments; far too small on their own) plus 5 benchmark-only fictitious documents with titles, chapters, articles, accents, running headers and page numbers (8 documents, 22 to 24 fragments depending on the chunking). It is still tiny: with 24 fragments, the top 5 already covers a fifth of the corpus, so hit@5 saturates and the benchmark mostly tells chunkings and arms apart through hit@1 and MRR.
- Golden set: 42 Spanish questions (`retrieval-cases.ts`): 17 literal, 8 paraphrased, 8 keyword or written without accents or with typos, 3 follow-up fragments, 6 with no answer in the corpus (2 of them near the domain: "¿Cuántos tractores tiene la cooperativa?").
- Judging: a returned fragment is right when it comes from the expected document and page and its own text contains the expected passage (accent- and case-insensitive substring), so it does not depend on chunk boundaries. Several acceptable answers are allowed.
- Metrics: hit@1, hit@5, MRR (rank within the top 5), no-answer precision (unanswerable questions that return nothing), per arm (vector only, text only, hybrid; `SearchQuery.arm` is a benchmark-only option never set by the API), distinct documents in the top 5 and characters handed to the model. `--sweep` also prints hybrid metrics for a grid of thresholds (vector 0.20 to 0.85, text up to the vector one) and the distribution of the best cosine of answerable and unanswerable questions.
- Embeddings are cached on disk (gitignored `rag-eval-results/`) by model, role and text, and uncached ones go in groups of four separated by `--pause` (free-tier limits). Gemini (`gemini-embedding-2`) is the measured provider; `--provider=ollama` (bge-m3) is optional. Search ties are broken by title and position, not by a random uuid, so runs are reproducible.

**2. Accent-insensitive full text.** Migration `20261022180000_unaccent_fulltext` creates the `unaccent` extension (a trusted contrib extension, present in the pgvector image) and the `spanish_unaccent` text search configuration (unaccent then `spanish_stem`); the generated `contentTsv`, its GIN index, the query tsquery and the lexemes of the term-coverage rule use it. Side effect: stopwords are matched after unaccenting, so "más" and "sí" are no longer dropped (harmless noise).

**3. Structure-aware chunking and contextual header.**

- `domain/structure.ts` recognizes, line by line, TÍTULO / CAPÍTULO / Sección / Disposición headings, ALL-CAPS headings, "Artículo N" and numbered items ("3.", "Primero.", "Punto 2."). Those start units kept whole when they fit in 800 characters; a heading never ends a fragment and a TÍTULO or CAPÍTULO starts a new one; only a unit larger than 800 is split (sentences, words, characters) and then the fragments keep the 150-character overlap. Fragments still never span two pages (BR-DOC-06). The heading path plus the articles in the fragment is its `section` (new nullable column), e.g. `TÍTULO IV > CAPÍTULO II > Artículo 25-26`.
- `domain/page-furniture.ts` removes lines that are only a page number and short lines at the top or bottom edge of a page that repeat (page numbers aside) on at least half of the pages of a document of 2 or more pages.
- `domain/context-header.ts` builds `"<title> · <category> · <section>"`. What is embedded and put in the tsvector is the header plus the fragment (new nullable `contextHeader` column; `contentTsv` covers it); `content`, shown and cited, stays the original text. **Measured, only the title is indexed** (`INDEXED_HEADER_PARTS`): adding the category and the section path lowered hit@1 and MRR (table below). The function supports all parts and `section` is stored, so a better use can be measured later.
- Known limits: a title change is not reflected in already indexed fragments until the next reindex; a wrapped line that starts with "Artículo 14" mid-sentence would be read as an article start.
- Migration `20261022190000_chunk_context` adds the columns, rebuilds the tsvector and marks `pending` every current `indexed` version of a published document. The API already re-enqueues pending versions at startup (`resumePending`), one at a time. Safest option considered: `replaceDocument` swaps the fragments of a document in one transaction, so until a document is reindexed its old fragments stay searchable, and if the embeddings service is down the version ends in `error` (old fragments kept) and can be retried (US-DOC-06). The alternative of a startup check against a "chunking version" was rejected as more code for the same effect.

**4. Per-document diversity and neighbour expansion.** After the fusion a document takes at most 2 of the 5 results when other documents have candidates (soft: held-back fragments fill the rest, so one relevant document keeps all its context). The assistant's search (not `GET /documents/search`) adds `context` to each fragment: the fragment plus the adjacent fragment of the same page when it is shorter than 400 characters or cut mid-sentence (and the previous one when it starts mid-sentence), overlap removed, at most 1600 characters per result. The tool gives the model the context; the citation (page and excerpt) keeps the fragment's own text and page.

**5. Gemini thresholds.** `gemini-embedding-2` cosines are compressed: the best fragment of answerable questions scored 0.64 to 0.80 and of unanswerable ones 0.54 to 0.74, so the old uncalibrated default (0.30) filtered nothing. A vector floor of **0.60** kept all 36 answerable cases at the same hit@1, hit@5 and MRR and removed the results of 4 of the 6 unanswerable ones, so it becomes the default (`DEFAULT_MIN_SCORE.gemini`). The text floor stays 0.25 (the sweep is flat from 0.15 to 0.45). Higher values (0.75) reach 100% no-answer precision but lose answerable questions (hit@5 91.7%); with a 24-fragment corpus that is not a safe margin, so it is not applied. bge-m3 defaults are unchanged (0.40 / 0.30).

**6. Follow-up questions.** The system prompt and the `search_documents` description now require a standalone query for follow-ups ("¿Y cuánto dura su mandato?" becomes "duración del mandato del consejo rector") and a new search instead of answering from the previous answer. An extra rewriting model call was not added: see the results.

## Results

Gemini (`gemini-embedding-2`), hybrid arm, 42 cases (36 answerable, 6 unanswerable); thresholds 0.30 / 0.25 until the last row:

| Step                                        | Fragments | hit@1 | hit@5  | MRR   | No-answer precision | Notes                                                                                          |
| ------------------------------------------- | --------- | ----- | ------ | ----- | ------------------- | ---------------------------------------------------------------------------------------------- |
| 1. Baseline                                 | 22        | 86.1% | 100.0% | 0.924 | 0.0%                | text arm alone 69.4% / 80.6% / 0.743; vector alone 80.6% / 0.880                               |
| 2. + accent-insensitive text arm            | 22        | 88.9% | 100.0% | 0.938 | 0.0%                | text arm alone 75.0% / 83.3% / 0.785                                                           |
| 3. + structure-aware chunking, title header | 24        | 88.9% | 100.0% | 0.940 | 0.0%                | text arm alone 77.8% / 83.3% / 0.806; vector alone 77.8% / 0.868                               |
| 4. + diversity and neighbour expansion      | 24        | 88.9% | 100.0% | 0.940 | 0.0%                | distinct documents in the top 5 3.61 to 3.83; model context 2814 to 4011 characters per search |
| 5. + Gemini vector floor 0.60 (default)     | 24        | 88.9% | 100.0% | 0.940 | 66.7%               | model context 3065 characters per search                                                       |

Header variants measured in step 3 (hybrid hit@1 / MRR): no header 88.9% / 0.944, title 88.9% / 0.940, title + category 86.1% / 0.926, title + category + section path 80.6% / 0.894.

bge-m3 (optional, same benchmark), hybrid hit@1 / hit@5 / MRR / no-answer precision: baseline 80.6% / 100% / 0.894 / 66.7%; after accents 83.3% / 100% / 0.907 / 66.7%; final 80.6% / 100% / 0.891 / 66.7% (its vector arm alone dropped from 75.0% to 61.1% hit@1 with the new chunking).

Honest reading: the gains are small and the corpus is tiny. The accent-insensitive text arm is the clearest win; structure-aware chunking is mainly neutral on this corpus while removing real defects (split articles, footers in fragments); the title header is neutral; diversity cannot show up in hit@5 with 24 fragments; the Gemini floor is the largest measurable change. 42 cases means one case is 2.4 points.

Assistant evaluation (`ai:eval`), 3 new multi-turn cases (`doc-followup-*`, with a check on the search query being standalone), the set now has 26 questions:

| Model               | Before the prompt change | After |
| ------------------- | ------------------------ | ----- |
| `gemini-3.8-flash`  | 3/3                      | 3/3   |
| `qwen3:4b-instruct` | 0/3                      | 0/3   |
| `qwen3:8b`          | 1/3                      | 2/3   |

The local models are measured on 3 cases, one run each: a one-case difference is noise. `qwen3:4b-instruct` fails because it answers the follow-up from the previous answer without calling the search, which a better query would not fix; a deterministic rewriting call was therefore not added (it would add a model call, several seconds on the target CPU per ADR-013, to fix a problem of tool use, not of the query). No Groq key was configured locally, so hosted evaluation on Groq was not run.

## Consequences

- Retrieval changes are now measured: any later change to chunking, thresholds or search runs `rag:eval` and states the before and after.
- Existing documents are reindexed on the first start after deploy (one at a time; their old fragments stay searchable until each is swapped). Locally the whole corpus of 8 documents (24 fragments) indexed in about 10 s with Gemini embeddings including a 2 s pause per 4 requests.
- The text index is larger (it covers the title) and `DocumentChunk` has two more nullable columns.
- The benchmark corpus is synthetic and small; the Gemini floor of 0.60 must be reviewed with real documents (`EMBEDDING_MIN_SCORE`).
- Changing the embeddings provider still requires reindexing (ADR-010).
