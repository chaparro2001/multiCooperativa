# ADR-009: Gemini as language and vision model

**Date**: 2026-10-20

**Status**: Accepted

## Context

[ADR-007](ADR-007-claude-for-vision-and-drafting.md) chose Claude for three uses of a language model:

- Extraction of invoices and delivery notes from a photo or PDF (US-INV-05, vision, structured output).
- Drafting the explanation of a discrepancy (US-INV-04).
- The AI assistant of Milestone 5, with tool calling and RAG ([requirements/07](../requirements/07-ai-assistant.md)).

The Anthropic API requires a credit card, which the project (a master's thesis with a fixed budget and a demo that must run for evaluators) does not have. The decision has to hold three constraints that ADR-007 already set: keys only in the backend (NFR-AI-03, NFR-INV-05), the provider behind a port (NFR-AI-02), and no extracted data stored without human confirmation (BR-INV-11).

## Options Considered

1. **Keep Claude (ADR-007)**
   - Best structured output and Spanish; pay-per-use from the first call and a card required.
   - Not viable for this project's budget.

2. **Gemini API (Google AI Studio)**
   - A free tier without a card for Flash-class models; vision, function calling and JSON-schema output in the same API; official `@google/genai` SDK.
   - Free-tier rate limits are low and Google may use free-tier content to improve its products.

3. **Local model with Ollama**
   - No keys and no data leaving, like the embeddings (ADR-006).
   - Vision and reliable tool calling need several GB of model and a GPU; unacceptable latency on the CPU of a laptop or a small server.

## Decision

Use **Gemini** (option 2), Flash class, through the **`@google/genai`** SDK, behind the existing ports. This **supersedes ADR-007**.

- Default model **`gemini-3.6-flash`** (stable, free tier per [the pricing page](https://ai.google.dev/gemini-api/docs/pricing) when this ADR was written). It is configured with `GEMINI_MODEL` so a lighter one (`gemini-3.5-flash-lite`) can be used if the free quota is tight.
- Key in `GEMINI_API_KEY`, validated at startup and only read in `main.ts`. Without it the assistant and the extraction answer 503 and the rest of the app works (as ADR-007 already required).
- **Assistant**: the `LanguageModel` port (`modules/assistant`) has one adapter, `GeminiLanguageModel`, that uses function calling over `generateContent`. It is stateless: the history is sent on every call and the model's own content is sent back untouched inside a tool loop (it carries the thought signatures). Tools stay read-only and run with the user's permissions (BR-AI-02, BR-AI-03).
- **Invoices** (`DocumentExtractor`, `DiscrepancyExplainer`): the Gemini adapters replace the Claude ones, with the response schema validated by the same Zod schemas as manual entry. The ports and the rules of ADR-007 do not change.
- Tests and CI use doubles of the ports; no test calls the network.
- Embeddings stay local (ADR-006).

### Data minimization

- Only what the task needs is sent: the document being extracted, or the question, the conversation turns and the results of the tools the user is allowed to call. Never other cooperative data and never data of another cooperative (the filters run in the queries, not in the prompt).
- Tool results are limited in size (a few rows, cut excerpts) and carry no passwords, tokens or contact data beyond what the screens already show.
- The logs of each request keep latency, tokens and tool names, never the content (NFR-AI-04).
- The thesis report must state that the free tier is not suitable for real personal data: Google's terms allow using free-tier content to improve its products. The demo uses the sample data of [sample-data.md](../sample-data.md). A real deployment would use the paid tier (no training on the content) or a local model, which is a configuration change thanks to the ports.

## Consequences

### Positive

- No card and no cost for development, the demo and the evaluation.
- Switching provider (paid Gemini, Claude, a local model) is another adapter for the same port; the use cases and tests do not change.

### Negative

- Free-tier limits (requests per minute and per day) can make the assistant answer 503 or slow under load; the per-user limit of BR-AI-08 helps but does not remove it.
- Free-tier content may be used by Google: the sample data only, until a paid tier or local model is configured.
- Answer quality and tool-calling reliability differ from Claude's; the evaluation set of NFR-AI-05 can be run against the real model (`pnpm --filter @multicooperativa/api ai:eval`) to measure it.

## References

- [ADR-006](ADR-006-local-model-embeddings.md), [ADR-007](ADR-007-claude-for-vision-and-drafting.md)
- [requirements/05](../requirements/05-invoices-and-delivery-notes.md), [requirements/07](../requirements/07-ai-assistant.md)
- Gemini API: <https://ai.google.dev/gemini-api/docs>
