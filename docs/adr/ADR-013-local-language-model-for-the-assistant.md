# ADR-013: Local language model for the assistant on the home server

**Date**: 2026-10-21

**Status**: Accepted

## Context

[ADR-009](ADR-009-gemini-language-and-vision-model.md) put the whole language side on Gemini's free tier. In practice the quota is the weak point: in October 2026 the Flash models allow about 20 requests per day each, and one assistant question costs 2 to 3 calls (tool loop). A demo that several evaluators try on the same day runs out. Besides the quota, every question and every answer (which may quote cooperative documents) goes to Google, whose free tier may use content to improve its products.

[ADR-012](ADR-012-home-server-with-cloudflare-tunnel.md) moved the API to a home server that already runs Ollama for embeddings ([ADR-006](ADR-006-local-model-embeddings.md)). The host has 32 GB of RAM and no GPU (Windows, Docker Desktop with WSL2, CPU only). The assistant's task is bounded: pick one of at most nine read-only tools, read a few fragments and answer briefly in Spanish with citations.

Invoice and delivery-note extraction is different: it needs vision and structured output, which a small local model does not do reliably, and it is used rarely (one call per document).

## Options Considered

1. **Gemini for everything (status quo, ADR-009)**: best answers (20 of 20 in the evaluation set when last measured) and fast, but the ~20 requests per day quota and the data leaving the server.
2. **A paid API such as DeepSeek**: no quota worries, but it needs a card and a payment, which the project does not have, and the data also leaves the server.
3. **A local tool-capable model in Ollama for the assistant, Gemini only for vision and explanations**: no quota, no cost, the questions stay on the server; slower and less accurate than Gemini, and it uses RAM.

## Decision

Option 3. The assistant's language model is chosen with `ASSISTANT_LLM_PROVIDER` (`gemini` or `ollama`; the code default stays `gemini`, the home-server `compose.yaml` sets `ollama`). A new adapter, `OllamaLanguageModel`, implements the existing language-model port over Ollama's `/api/chat` (non-streamed, native function tools, `think: false`, `num_ctx` 8192, one call limited by `ASSISTANT_OLLAMA_TIMEOUT_MS`, 90 s by default). The model is `ASSISTANT_OLLAMA_MODEL`, **`qwen3:8b`** by default. Gemini keeps invoice extraction (vision) and the discrepancy explanations. Embeddings stay on `bge-m3`.

A small model can break the tool protocol. The adapter treats a call to an unknown tool, malformed arguments, a tool call written as text, an HTTP error or a timeout as an error, which the use case already turns into "assistant unavailable" (503). Security does not change: the tools, their permissions and the citations are the same code for both providers (BR-AI-01 to BR-AI-04).

### Choice of model

The 22-question evaluation set (`ai:eval`, NFR-AI-05) was run against candidates in the development Ollama container (Docker Desktop on a 12-core Mac, CPU only, which is a proxy for the home server, not the server). Latency is per question (up to 6 model calls, normally 2); RAM is what `ollama ps` reports with the 8192-token context.

First round (first version of the system prompt, 8 GB for Docker):

| Model                 | Passed | Median / p90     | RAM    | Note                                                                    |
| --------------------- | ------ | ---------------- | ------ | ----------------------------------------------------------------------- |
| `qwen3:4b` (thinking) | 20/22  | 57.3 s / 102.5 s | 4.2 GB | `think: false` is ignored by this tag (it is the always-thinking build) |
| `qwen3:4b-instruct`   | 13/22  | 3.9 s / 9.6 s    | 4.2 GB | Often refused ("no tengo acceso") without calling a tool                |
| `qwen3:8b`            | 16/22  | 7.0 s / 21.2 s   | 6.7 GB | Same tendency to refuse without searching                               |
| `llama3.2:3b`         | 7/22   | 6.6 s / 10.6 s   | 3.4 GB | Answers without citations                                               |
| `qwen2.5:3b`          | 5/22   | 4.1 s / 8.3 s    | 2.7 GB | Rarely calls tools                                                      |

The failures of the non-thinking models were mostly one behaviour: they answered "I have no access" or "I do not find it" without calling `search_documents`. The system prompt was adjusted (call a tool first when one can hold the answer, with two generic examples that are not evaluation questions; the "no access" answer only for modules without tools; relative periods such as "this week" computed from today; the optional argument of `voting_result` may be left out). The changes only add guidance and do not contradict the previous rules.

Second round (final prompt, 25 GB for Docker, 12 CPUs):

| Model               | Passed | Median / p90   | RAM    |
| ------------------- | ------ | -------------- | ------ |
| `qwen3:8b`          | 19/22  | 7.1 s / 25.9 s | 6.7 GB |
| `qwen3:4b-instruct` | 18/22  | 5.0 s / 15.4 s | 4.2 GB |

`qwen3:8b` is chosen: the most accurate non-thinking model, typical latency well under 30 s, and the host has the memory. The thinking `qwen3:4b` passed 20 of 22 but takes a minute per question, which is unusable in a chat. `qwen3:4b-instruct` is the fallback for hosts with less RAM (`ASSISTANT_OLLAMA_MODEL=qwen3:4b-instruct`).

## Consequences

### Positive

- The assistant has no quota and no cost, works without internet access to Google and keeps the questions, the answers and the retrieved fragments on the server.
- The Gemini quota is left for invoice extraction and explanations, where it is hardly used.
- The port was already there (NFR-AI-02): one adapter, one factory, no change in the use case or the tools. Going back is one variable.

### Negative

- **Quality.** 19 of 22 evaluation questions against 20 of 20 for Gemini when it was last measured (the prompt was changed since and Gemini was not re-run, to save its quota). The remaining failures are a missing date range for "this week", answering a vote without saying it was approved and, for a request to summarize a document that contains instructions, not calling the search tool. Answers can be less polished than Gemini's.
- **Latency.** On a 12-core CPU the typical question takes about 7 s and the slowest 30 s (versus 2 to 5 s with Gemini). The home server's CPU is unknown and may be slower; the first question after a restart also loads the model from disk. The timeout (90 s) bounds a call.
- **RAM.** `qwen3:8b` takes about 6.7 GB loaded and `bge-m3` 1.2 GB; with the rest of the stack about 9 GB. WSL2 needs `memory=16GB` (`docs/04-deployment.md`); the Ollama container limit is 10 GB. The first start downloads about 5 GB more.
- Requests are served one at a time per model (`OLLAMA_NUM_PARALLEL=1`): several users asking at once wait in line.
- Reasoning builds of a model (such as the `qwen3:4b` tag) ignore `think: false` and take a minute per answer: use an instruct build, and re-run `ai:eval` when changing the model.

### Relation to other ADRs

- [ADR-009](ADR-009-gemini-language-and-vision-model.md) is not superseded: Gemini remains the vision and explanation model, and the default provider of the assistant outside the home server (development, `render.yaml`). The assistant can go back to Gemini with `ASSISTANT_LLM_PROVIDER=gemini`.
- [ADR-006](ADR-006-local-model-embeddings.md) and [ADR-012](ADR-012-home-server-with-cloudflare-tunnel.md): the same Ollama container now serves two models.

## References

- `apps/api/src/modules/assistant/infrastructure/ollama-language-model.ts`, `apps/api/scripts/assistant-eval.ts`
- `deploy/home-server/compose.yaml`, `docs/04-deployment.md`
- <https://docs.ollama.com/api/chat>
