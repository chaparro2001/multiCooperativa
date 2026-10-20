# ADR-010: Gemini embeddings for the hosted demo

**Date**: 2026-10-20

**Status**: Accepted

## Context

[ADR-006](ADR-006-local-model-embeddings.md) chose a local model (`bge-m3`) served by Ollama. That remains the right choice for development and for any deployment that can host it. The thesis demo, however, has to run for free and without a credit card (Render free web service, Neon, Supabase Storage, GitHub Pages), and no free tier hosts Ollama: it needs about 2 GB of RAM and the Render free instance has 512 MB.

Constraints:

- The `embedding` column is `vector(1024)`; changing its size would need a migration (ADR-006).
- Embeddings stay behind the `Embedder` port (NFR-AI-02) and keys only live in the backend (NFR-AI-03).
- A Gemini key already exists for the assistant and document extraction ([ADR-009](ADR-009-gemini-language-and-vision-model.md)), so no new account or secret is needed.

## Options Considered

1. **Ollama on a free host**: does not fit in the memory of any free tier.
2. **Voyage AI / OpenAI embeddings**: new account, key and, probably, a card.
3. **Gemini embeddings** (`gemini-embedding-2`), same key as ADR-009. The model accepts `outputDimensionality` between 128 and 3072; asking for 1024 matches the column.

## Decision

Add a **`GeminiEmbedder`** adapter for the existing `Embedder` port, selected by `EMBEDDINGS_PROVIDER=ollama|gemini` (default `ollama`).

- Model from `GEMINI_EMBEDDING_MODEL` (default `gemini-embedding-2`), always requested with `outputDimensionality: 1024`.
- `gemini-embedding-2` has no task type: the role goes in a text prefix (`task: search result | query: ...` for queries, `title: none | text: ...` for fragments). `gemini-embedding-001` uses `taskType` (`RETRIEVAL_QUERY` / `RETRIEVAL_DOCUMENT`) instead. The port gains an optional `kind: 'document' | 'query'` argument for this; Ollama ignores it.
- Vectors are L2-normalized in the adapter (required for `-001` at reduced sizes, harmless for `-2`).
- The adapter checks the dimension and fails with `EmbeddingUnavailableError`, like the Ollama one.
- Tests inject a fake client: no network.
- With `EMBEDDINGS_PROVIDER=gemini`, `GEMINI_API_KEY` is required and `OLLAMA_URL` is not.

**Vectors of different models are not comparable.** Each environment must index and search with the same provider. Development (Ollama) and the hosted demo (Gemini) therefore keep separate databases, and the hosted database is indexed only through the normal paths: uploading documents, or the seed's indexing step (`docs/04-deployment.md`). Never copy `embedding` rows between environments, and switching provider in an existing environment requires reindexing its documents.

## Consequences

### Positive

- The hosted demo needs no extra service, account or secret.
- ADR-006 stays valid for local work and for any deployment that can host Ollama.

### Negative

- Document text leaves for Google. On the free tier Google may use the content to improve its products, so the demo must not receive real third-party documents.
- The free tier has rate limits; indexing is batched (16 texts per request) and a long document may be slow or fail with `EmbeddingUnavailableError`, which the indexing job reports and retries on restart.
- Two providers to keep in mind when debugging search quality.

## References

- [ADR-006](ADR-006-local-model-embeddings.md), [ADR-009](ADR-009-gemini-language-and-vision-model.md)
- <https://ai.google.dev/gemini-api/docs/embeddings>
