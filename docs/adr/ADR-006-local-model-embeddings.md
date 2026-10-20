# ADR-006: Embeddings with a local model served by Ollama

**Date**: 2026-10-04

**Status**: Accepted

## Context

The documents of each cooperative are indexed for content search (US-DOC-07) and for the assistant's RAG (requirements/07). Indexing requires computing the embedding of each fragment, and searching requires computing that of each query.

Constraints:

- Content in Spanish: bylaws, minutes, regulations.
- The provider sits behind a port (NFR-AI-02) and its keys, if any, only in the backend (NFR-AI-03).
- A 50-page document must be indexed in under 60 seconds (NFR-DOC-01).
- The vector dimension is fixed in the pgvector schema: changing model requires a migration and reindexing.

## Options Considered

1. **Voyage AI** (`voyage-3.5`, 1024 dimensions)
   - Partner recommended by Anthropic for RAG; multilingual.
   - API key, pay-per-use cost, and the cooperatives' texts leave for a third party.

2. **OpenAI** (`text-embedding-3-small`, 1536 dimensions)
   - Cheap and widely used.
   - Same drawbacks of key, cost and data leaving.

3. **Local model with Ollama** (`bge-m3`, 1024 dimensions)
   - No keys or pay-per-use cost; documents do not leave our own infrastructure.
   - One more service to deploy and slower on CPU.

## Decision

Use a **local model served by Ollama** (option 3), with **`bge-m3`**: multilingual, good performance in Spanish and 1024-dimension vectors.

- The documents module depends on the `Embedder` port; the adapter calls Ollama's HTTP API (`/api/embed`) in batches.
- The `embedding` column is `vector(1024)`. The adapter checks the dimension and fails with a clear message if the configured model does not match.
- In development, Ollama runs in Docker Compose (`ollama/ollama:0.35.1`) and the model is downloaded with `pnpm ai:pull`.
- Tests and CI use a deterministic in-memory `Embedder`; the Ollama adapter has an integration test that only runs if Ollama responds.
- Indexing is asynchronous with respect to upload (requirements/03, section 4): an in-process queue that recovers pending versions on startup.

## Consequences

### Positive

- No keys or pay-per-use cost; the document text does not leave the infrastructure.
- Switching to an external provider is another adapter for the same port, plus a migration if the dimension changes.

### Negative

- In production (Milestone 6) an Ollama service is needed with the model and enough memory (about 2 GB).
- Docker on macOS has no GPU acceleration: indexing is slower locally than on a Linux server.
- The in-process queue does not survive a restart in the middle of a job; recovering pending items on startup compensates for this.

## References

- [requirements/03-documents.md](../requirements/03-documents.md), [requirements/07-ai-assistant.md](../requirements/07-ai-assistant.md)
- [ADR-003](ADR-003-multi-cooperative.md): every fragment carries `cooperativeId` and the search filters by it.
