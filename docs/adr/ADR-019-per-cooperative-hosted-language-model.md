# ADR-019: Per-cooperative hosted language model with the cooperative's own API key

**Date**: 2026-10-21

**Status**: Accepted

## Context

[ADR-013](ADR-013-local-language-model-for-the-assistant.md) moved the assistant to a local model because the Gemini free tier is too small for a demo, and [ADR-014](ADR-014-per-cooperative-assistant-model.md) let each cooperative pick among the models the operator installed. A CPU-only home server is still slow and small: a cooperative that wants better answers or faster ones has no way to get them without the operator buying hardware.

Several hosted providers expose an OpenAI-compatible API with a free tier, and those tiers are **per account, not per server**: Groq allows about 1,000 requests per day per organization, Mistral gives $10 per month of credits, NVIDIA NIM and OpenRouter (`:free` models) offer free access to open models. If the server uses one key, all cooperatives share one small quota (the same problem as ADR-009). If each cooperative brings its own key, each one has its own quota and pays, if ever, for its own use.

Options that were looked at and discarded: Hugging Face inference gives about $0.10 per month of credits, not viable for an assistant that makes 2 to 3 calls per question; Cerebras ended its free tier in July 2026.

The decision to use a **per-cooperative key, not a platform key**, was taken by the product owner.

## Options Considered

1. **One platform key on the server** (an env var): simple, but every cooperative consumes the same quota and the operator carries the cost and the risk of abuse.
2. **A provider URL typed by the administrator** (any OpenAI-compatible endpoint): the most flexible, but it makes the API call any URL a client sends (SSRF towards the server's internal network, cloud metadata, the Docker network).
3. **A fixed catalog of providers in code, with the cooperative's own key**: each cooperative uses its own account; the server only ever calls a known host.

## Decision

Option 3.

- **Catalog.** The domain lists the providers, each with a fixed HTTPS base URL: `groq` (`https://api.groq.com/openai/v1`), `mistral` (`https://api.mistral.ai/v1`), `nvidia` (`https://integrate.api.nvidia.com/v1`), `openrouter` (`https://openrouter.ai/api/v1`). A request names the provider by id; the URL always comes from the catalog, never from the client. Each entry carries suggested model ids, but the administrator may type any model id (non-empty, at most 200 characters, no whitespace); what the provider really serves is checked against its model list on save.
- **One adapter.** `OpenAICompatibleLanguageModel` implements the existing `LanguageModel` port with `POST {baseUrl}/chat/completions` and function tools, using plain `fetch` (no new SDK) and a timeout. `401`/`403` map to a key-invalid error; `429`, `5xx`, timeouts and network failures map to a transient error. The key travels only in the `Authorization` header and never appears in an error, a log line or the audit log.
- **Storage.** `AssistantSetting` (ADR-014) gets `source` (`local` default, or `hosted`), `hostedProvider`, `hostedModel`, `apiKeyCiphertext`, `apiKeyIv`, `apiKeyTag` and `apiKeyHint` (the last four characters). The existing `model` column keeps its meaning for the local choice and becomes nullable.
- **Encryption at rest.** The key is encrypted with AES-256-GCM (`node:crypto`, random 12-byte IV per encryption, authentication tag) under a master key from the new variable `ASSISTANT_SECRETS_KEY` (32 random bytes in base64, `openssl rand -base64 32`; validated at startup). The cipher is behind a `SecretCipher` port so tests use a deterministic fake. **Without the variable hosted mode is unavailable**: `GET` answers `hostedAvailable: false` and `PUT` with a hosted provider answers `409 hosted_provider_unavailable`. The API key is never returned: only `apiKeyHint`.
- **API.** `GET /cooperatives/{id}/settings/assistant-model` keeps its fields and adds `source`, `hostedAvailable`, `hosted: { provider, model, keyHint } | null` and `providers: [{ id, suggestedModels }]`. `PUT` accepts the existing `{ model }` (local, unchanged), `{ source: 'local' }` (back to the server's model; the stored key is erased) or `{ source: 'hosted', provider, model, apiKey? }`; `apiKey` is required the first time or when the provider changes and optional to keep the stored one. Same permission as ADR-014 (`users` module at `manage`, 403 / 404 as there).
- **Verification on save.** Before saving, the API calls `GET {baseUrl}/models` with the key (10 s timeout): `401`/`403` answer `422 assistant_provider_key_invalid`; a model the provider does not list answers `422 assistant_model_not_available`; any other failure of the provider answers `502 assistant_provider_unreachable`. A missing key answers `422 assistant_api_key_required`. Nothing is saved on failure.
- **Use at runtime.** When a cooperative's source is hosted, each request uses the adapter with the decrypted key, whatever `ASSISTANT_LLM_PROVIDER` is (hosted overrides it). If the provider fails (key rejected, quota, overload, timeout, a malformed answer) the server's own model (the cooperative's local choice or the default of ADR-013/014; Gemini when that is the provider) answers instead, for the rest of that request, so the assistant keeps working; a warning is logged without the key. The turns of the hosted model are dropped from the history sent to the fallback model, because another provider cannot continue them.
- **Audit.** Changes are recorded with the existing `assistant.model_changed` event (`recordAudit` of the access module) with previous and new choice written as `hosted:groq/openai/gpt-oss-20b` or `local:qwen3:8b`. This also changes the detail of local changes, which used to hold the bare model id. Replacing the key without changing anything else is audited too; the key is never part of the entry.
- **Structure.** Pure rules (catalog, model id and key format, hint, audit label) live in the assistant's `domain/`; the use cases receive a `HostedProviderGateway`, a `SecretCipher` and a store as ports; the fetch adapter, the AES-GCM cipher and the Prisma store live in `infrastructure/`. Tests use fakes: no test calls a real provider.
- **App.** The administrator's settings screen chooses between "Local model of the server" and "External provider": provider picker, model field with suggestions, secure API key field (shows "saved key …abcd"; empty keeps it), a privacy note and the messages for the new error codes, all in the i18n catalog.

## Consequences

**Positive**

- Each cooperative has its own quota and can pick a bigger or faster model than the host can run, without touching the server.
- No SSRF surface: the server only calls four known hosts.
- The assistant keeps answering when a provider is down, out of quota or the key is revoked.
- The operator holds no provider key and carries no cost.

**Negative / to watch**

- **Privacy.** The cooperative's questions and the data the tools read to answer them (invoices, documents, assemblies the user can see) are **sent to a third party**, outside the server and possibly outside the EU. The app says so next to the control. The administrator is responsible for accepting the provider's terms. In particular, **Mistral's free mode may train on inputs**; Groq, NVIDIA NIM and OpenRouter have their own policies.
- **Key custody.** The server holds a secret of each cooperative that opted in. Encryption at rest protects a database dump, not a compromised server process (it has the master key). The master key lives only in the server environment (`.env.server`), never in the repository.
- **Rotating `ASSISTANT_SECRETS_KEY` invalidates every stored key.** Decryption fails, the assistant falls back to the server's model (with a warning) and the administrator has to type the key again (`assistant_api_key_required`). There is no re-encryption path; if one is needed, a migration script can decrypt with the old key and encrypt with the new one.
- Free tiers change without notice (limits, models, even the existence of the tier); the suggested model ids may go stale, which is why the model id is free text checked against the provider's list.
- Provider models differ in how well they follow the tool protocol; a malformed tool call counts as a provider failure and triggers the fallback.
- The audit detail of local changes now has the `local:` prefix.

## Relation to other ADRs

- Extends [ADR-014](ADR-014-per-cooperative-assistant-model.md): same table, endpoint, permission and audit event; adds a second source. It does not edit it.
- Leaves [ADR-009](ADR-009-gemini-language-and-vision-model.md) and [ADR-013](ADR-013-local-language-model-for-the-assistant.md) as decided: Gemini still does extraction and discrepancy explanations, and the local or default model remains the fallback.
- Uses the access rules of [ADR-004](ADR-004-profile-based-access-control.md) and the isolation of [ADR-003](ADR-003-multi-cooperative.md) unchanged; rule 6 of `CLAUDE.md` (AI keys only in the backend) holds: the key never reaches the app after it is typed.
