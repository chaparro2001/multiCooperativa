# ADR-014: Per-cooperative choice of the assistant's local model

**Date**: 2026-10-21

**Status**: Accepted

## Context

[ADR-013](ADR-013-local-language-model-for-the-assistant.md) runs the assistant on a local Ollama model chosen by the operator with `ASSISTANT_OLLAMA_MODEL` (`qwen3:8b` by default). The benchmark in that ADR shows a real trade-off: `qwen3:8b` answers more questions correctly, `qwen3:4b-instruct` answers about twice as fast and uses less memory. Which one is better depends on the cooperative (how much it values speed over precision) and it is a decision of the cooperative's administrator, not of whoever deploys the server. The server hosts several cooperatives ([ADR-003](ADR-003-multi-cooperative.md)), so one global value forces the same choice on all of them.

The app must never become a way to make the server download or run arbitrary models: the host is a CPU-only machine with a fixed amount of RAM and a public API.

## Options Considered

1. **Keep a single server-wide model (ADR-013)**: nothing to build, but the choice stays with the operator and every cooperative gets the same trade-off.
2. **Per-user choice**: too granular. Two members of the same cooperative would get different answers to the same question, and every user could keep a different model in memory.
3. **Per-cooperative choice by its administrator, from an operator allowlist**: the cooperative decides, the operator bounds what can run.

## Decision

Option 3.

- **Allowlist.** A new variable, `ASSISTANT_OLLAMA_MODELS` (comma-separated; the home-server default is `qwen3:8b,qwen3:4b-instruct`), lists the models a cooperative may pick. `ASSISTANT_OLLAMA_MODEL` is always part of it and stays the server default. A model is **offered only if it is in the allowlist and installed in Ollama**: the API asks `GET {OLLAMA_URL}/api/tags` (cached for 15 s). The API never calls `/api/pull`: models are downloaded by the operator (`ollama-pull` in the home-server compose, `pnpm ai:pull:chat` in development). Anything outside the list is rejected with `422 assistant_model_not_available`, so a client cannot make the host download or load an arbitrary model (denial of service by memory or disk).
- **Where the setting lives.** In the **assistant module**, in its own table `AssistantSetting` (`cooperativeId` primary key, `model`). No row means "the server default". It is not a column of `Cooperative` because that table belongs to the access module (rule 4 of `CLAUDE.md`: never touch another module's tables) and the setting only means something to the assistant. A different, more general "cooperative settings" table can absorb it later without changing the API. Like the rest of the assistant tables it keeps only the cooperative id, with no foreign key towards access ([ADR-002](ADR-002-modular-monolith.md)).
- **Who can change it.** The administrator of the cooperative, which in the permission model ([ADR-004](ADR-004-profile-based-access-control.md)) is whoever has the **`users` module at `manage` level** (the same rule as `isAdminProfile`). No new permission is added: the settings are part of administering the cooperative, and the profile × module matrix of the access specification does not change. Reading the options requires the same permission (deny by default): a member does not need to know which models exist. A user of another cooperative gets 404, one without the permission 403.
- **Audit.** Every change that alters the effective model is recorded in the existing audit log (`assistant.model_changed`, with the previous and the new model), through a function the access module exposes in its `index.ts` (`recordAudit`); the assistant never writes the audit table itself. The audit row names the administrator as actor and subject (the log requires a user subject).
- **Use.** With `ASSISTANT_LLM_PROVIDER=ollama`, each request resolves the model of **its own cooperative** (`AssistantSetting`) and falls back to the server default if the saved model is no longer allowed or installed, so an operator removing a model never breaks the assistant. With `gemini` the setting is ignored: the endpoint answers `provider: "gemini"` with nothing to choose, `PUT` answers `409 local_model_not_in_use`, and the app shows a note instead of a control.
- **API.** `GET /cooperatives/{id}/settings/assistant-model` returns `{ provider, current, default, options: [{ id }] }`; `PUT` with `{ model: string | null }` saves it (`null` goes back to the default). The app words each option (`qwen3:8b` "more precise", `qwen3:4b-instruct` "faster") from its own i18n catalog; the API only knows ids.
- **Structure.** Pure rules (which models are offered, which one is used) live in the assistant's `domain/`; the use cases receive a `LocalModelRuntime` port (list installed models, create a chat model) and a settings store, with an Ollama adapter and a Prisma adapter in `infrastructure/`. Tests use a fake runtime, so none depends on a real Ollama.

## Consequences

**Positive**

- Each cooperative chooses between speed and precision without touching the server.
- The cost is bounded by the operator: only allowlisted, already installed models can ever run.
- No change to the permission matrix; isolation is by construction (the row is keyed by cooperative id and the route is behind `requireCooperative`).
- The setting is auditable and reversible.

**Negative / to watch**

- **RAM.** Two cooperatives on different models make Ollama keep two chat models plus the embeddings model loaded: about 6.7 GB + 4.2 GB + 1.2 GB. `OLLAMA_MAX_LOADED_MODELS` stays at 2 in the home-server compose (it was already 2 for embeddings + chat), so with three models in use Ollama unloads the least recently used one and the next request pays the load time (several seconds). The Ollama container limit goes from 10 to 12 GB, which still fits the recommended `memory=16GB` of WSL2 ([docs/04-deployment.md](../04-deployment.md)). With a smaller host, allowlist a single model.
- **First answer after a change is slower** (model load); the app says so.
- With `OLLAMA_NUM_PARALLEL=1` a slow model of one cooperative delays the others when they share the model; not a new problem, only more visible.
- The audit row uses the administrator as subject, which is a small stretch of the log's "target user" column; a general audit subject can be introduced if more cooperative-level settings appear.
- Two allowlisted models are installed on the host (about 9.4 GB of disk instead of 5.2 GB).

## Relation to other ADRs

- Extends [ADR-013](ADR-013-local-language-model-for-the-assistant.md): the provider and the default model stay as decided there; this ADR only lets each cooperative override the default among allowlisted models. It does not edit it.
- Uses the access rules of [ADR-004](ADR-004-profile-based-access-control.md) and the isolation of [ADR-003](ADR-003-multi-cooperative.md) unchanged.
