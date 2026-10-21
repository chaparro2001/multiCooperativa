# ADR-015: qwen3:4b-instruct as the default assistant model of the hosted demo

**Date**: 2026-10-21

**Status**: Accepted

## Context

[ADR-013](ADR-013-local-language-model-for-the-assistant.md) chose `qwen3:8b` as the assistant's local model after a benchmark on the development Mac: `qwen3:8b` passed 19 of 22 evaluation questions (median 7.1 s, p90 25.9 s, 6.7 GB of RAM) and `qwen3:4b-instruct` passed 18 of 22 (median 5.0 s, p90 15.4 s, 4.2 GB). The ADR also estimated that the home server (Intel i5-10500, 6 cores / 12 threads, DDR4, CPU only, 32 GB of RAM, WSL2 limited to 16 GB) would be 2 to 3 times slower than the Mac: a median of about 15 to 20 s and a p90 of 50 to 75 s for `qwen3:8b`, against about 10 to 15 s and 35 to 55 s for `qwen3:4b-instruct`.

[ADR-014](ADR-014-per-cooperative-assistant-model.md) then made the model selectable per cooperative from an operator allowlist, so the server default is only the starting point.

The project owner tried the assistant on the real server with `qwen3:4b-instruct` and reports that it works well and answers acceptably fast, while `qwen3:8b` is noticeably slower on that CPU. These observations are user-reported; they were not measured with the evaluation set on the server.

## Options Considered

1. **Keep `qwen3:8b` as the hosted-demo default (ADR-013)**: one more question passed in the Mac benchmark (19/22 against 18/22), but the slowest answers on a CPU-only server, which is what an evaluator trying the demo notices first.
2. **`qwen3:4b-instruct` as the default, `qwen3:8b` selectable per cooperative (ADR-014)**: the first answers are faster and the memory footprint is lower (4.2 GB against 6.7 GB); precision is slightly lower in the Mac benchmark, and a cooperative that prefers precision can choose `qwen3:8b` in Settings.
3. **Change the code default in `apps/api/src/config/env.ts` as well**: it would change the development default and the tests for a deployment concern. Not needed: the hosted demo sets its own default in `deploy/home-server/compose.yaml`.

## Decision

Option 2.

- The default of `ASSISTANT_OLLAMA_MODEL` in `deploy/home-server/compose.yaml` (for the `api` and `ollama-pull` services) is `qwen3:4b-instruct`, and the allowlist default of `ASSISTANT_OLLAMA_MODELS` is `qwen3:4b-instruct,qwen3:8b`. Both models stay installed by `ollama-pull`, and `qwen3:8b` stays selectable per cooperative ([ADR-014](ADR-014-per-cooperative-assistant-model.md)).
- The code default (`qwen3:8b` in `apps/api/src/config/env.ts`) and the development script `pnpm ai:pull:chat` do not change.
- The benchmark numbers of ADR-013 stay attributed to the Mac. For the server the documentation says "user-reported as acceptable; not measured with the evaluation set".

## Consequences

**Positive**

- Faster answers for evaluators on the CPU-only server, and 2.5 GB less RAM for the default model.
- With `qwen3:4b-instruct` as the default, the common case needs one chat model loaded next to the embeddings model; `qwen3:8b` is only loaded if a cooperative chooses it.

**Negative / to watch**

- Slightly lower precision than `qwen3:8b` in the Mac benchmark (18/22 against 19/22); on the server this has not been measured.
- The hosted demo and the development default differ (`qwen3:4b-instruct` against `qwen3:8b`); it is documented in the deployment guide.
- The memory advice of ADR-014 still applies when cooperatives use both models at once (about 4.2 GB + 6.7 GB + 1.2 GB for embeddings): the recommended `memory=16GB` of WSL2 for a 32 GB host is kept, and Ollama can hold both models loaded (`OLLAMA_MAX_LOADED_MODELS=2`).

## Relation to other ADRs

- Amends the model choice of [ADR-013](ADR-013-local-language-model-for-the-assistant.md) for the home server only; the provider, the benchmark and the rest of that ADR stand. ADR-013 is not edited beyond a pointer in its status line.
- Relies on [ADR-014](ADR-014-per-cooperative-assistant-model.md): `qwen3:8b` remains available through its selector and allowlist.
