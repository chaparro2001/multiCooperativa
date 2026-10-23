# ADR-026: Gemini Flash-Lite for the assistant of the published demo

**Date**: 2026-10-23

**Status**: Accepted

## Context

[ADR-013](ADR-013-local-language-model-for-the-assistant.md) moved the assistant to a local Ollama model on the home server, [ADR-015](ADR-015-qwen3-4b-instruct-default-for-the-hosted-demo.md) chose `qwen3:4b-instruct` as its default and [ADR-019](ADR-019-per-cooperative-hosted-language-model.md) let each cooperative bring a hosted provider with its own key. ADR-015 recorded that the 4B model was "user-reported as acceptable; not measured on the server". It has now been measured on the published demo (home server, CPU only, [04-deployment.md](../04-deployment.md)):

- **Local `qwen3:4b-instruct` on the server CPU**: a question takes more than 30 s. The Ollama log of one question shows the first model call at 8.6 s and the second at 44.3 s; each question makes two model calls of about 3,700 input tokens each. On a Mac with a GPU the same question takes about 5 s. An evaluator trying the demo waits too long.
- **Groq free tier through ADR-019** (`qwen/qwen3.8-27b`, then `openai/gpt-oss-20b`): HTTP 429 because the free tokens-per-minute limit (about 6 to 8k) is below the roughly 7.5k tokens of one question, and one HTTP 400, most likely `tool_use_failed`: these are reasoning models and the OpenAI-compatible adapter does not disable the reasoning (the response body is not logged, so the cause is not confirmed). Every question fell back to the slow local model.

Invoice extraction already uses Gemini on the same server ([ADR-009](ADR-009-gemini-language-and-vision-model.md)), and the Gemini adapter already has retries with backoff and fallback models (`shared/infrastructure/resilient-call.ts`).

## Options Considered

1. **Keep `qwen3:4b-instruct` on the server CPU (ADR-015)**: private and free, but more than 30 s per question.
2. **`qwen3:8b` on the server CPU (ADR-013)**: more precise in the Mac benchmark but slower still on this CPU; it does not solve the latency.
3. **Groq free tier, per cooperative (ADR-019)**: tried, see above. The token limit per minute is smaller than one question and the reasoning models fail on tool calls. A larger plan would need a card.
4. **Mistral free tier through ADR-019**: not tried on the demo. It has the same two risks (a per-minute token limit and an OpenAI-compatible adapter that does not control reasoning) and its monthly credits are small for an assistant that makes two or three calls per question.
5. **Gemini Flash-Lite for the whole server**: already integrated (adapter, retries, fallback models, tool calling), the same key as extraction, and answers in a few seconds.
6. **Streaming the answer** so the user sees the text while the local model writes it: it improves the perceived latency, not the total time, and needs changes in the API and the apps. Kept as a future improvement, not part of this decision.

## Decision

Option 5, for the published demo only.

- `.env.server` of the home server sets `ASSISTANT_LLM_PROVIDER=gemini` with `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.5-flash-lite` (the template default) and `GEMINI_FALLBACK_MODELS=gemini-3.1-flash-lite,gemini-3.6-flash,gemini-3.8-flash`. Flash-Lite is the main model because the free tier of the Flash models allows about 20 requests per day. 503 and 429 are retried with backoff and then fall to the next model. Answers take a few seconds.
- **Embeddings stay local** (`bge-m3` in Ollama, [ADR-006](ADR-006-local-model-embeddings.md)).
- **The stack default does not change**: `deploy/home-server/compose.yaml` keeps `ASSISTANT_LLM_PROVIDER=ollama` with `qwen3:4b-instruct`, and the code default in `apps/api/src/config/env.ts` does not change. This ADR does not supersede ADR-013 or ADR-015; it records what the published demo runs.
- **Cooperatives must use "Modelo del servidor"**: a hosted provider set by a cooperative (ADR-019) overrides the server provider. The per-cooperative local model choice ([ADR-014](ADR-014-per-cooperative-assistant-model.md)) has no effect while the server provider is Gemini.

## Consequences

**Positive**

- Answers in a few seconds instead of more than 30 s, with tool calling that works and retries and fallback models already in place.
- No code change: it is configuration of the demo server.

**Negative / to watch**

- **Privacy**: with Gemini the questions and the data returned by the tools (invoices, documents, members of the demo) are sent to Google, and the free tier lets Google use the content to improve its products. This is acceptable because the demo data is fictitious. A real cooperative keeps the local default (`ollama`), which sends nothing out ([ADR-013](ADR-013-local-language-model-for-the-assistant.md)).
- **Shared quota**: the assistant and invoice extraction use the same key and the same daily quota. Heavy use of the assistant can leave scanning without quota and the other way round.
- **Not measured on the evaluation set**: the assistant was tuned and evaluated with `qwen3:4b-instruct` (47 of 60 on the set); `gemini-3.5-flash-lite` has not been run on the 60 questions yet. Until it is, no precision claim is made for the published demo.
- The Settings selector of the local model is inert on the demo while the server provider is Gemini.

**How to revert**

Set `ASSISTANT_LLM_PROVIDER=ollama` in `.env.server` (or remove the line, since `compose.yaml` defaults to it) and run `docker compose --env-file .env.server up -d api`. No data migration is involved.

## Relation to other ADRs

- Complements [ADR-013](ADR-013-local-language-model-for-the-assistant.md) and [ADR-015](ADR-015-qwen3-4b-instruct-default-for-the-hosted-demo.md): they keep the stack and code default; this one sets the provider of the published demo.
- Builds on [ADR-009](ADR-009-gemini-language-and-vision-model.md) (the Gemini adapter, retries and fallback models) and takes the Groq experience of [ADR-019](ADR-019-per-cooperative-hosted-language-model.md) into account; ADR-019 stays available to cooperatives that bring their own key.
