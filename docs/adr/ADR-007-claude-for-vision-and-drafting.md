# ADR-007: Claude for vision extraction and drafting explanations

**Date**: 2026-10-04

**Status**: Accepted

## Context

The invoices and delivery notes module needs two uses of a language model (requirements/05):

- **Extraction** (US-INV-05): read from a photo or a PDF the document type, tax IDs, number, dates, amounts and lines, with a confidence level per field. It must respond in under 15 seconds (NFR-INV-01).
- **Discrepancy explanation** (US-INV-04): draft in plain language why an invoice does not match its delivery notes. The numeric detail is what governs (BR-INV-12).

The Milestone 5 assistant will also need a language model. Keys live only in the backend (NFR-INV-05), and no extracted data is stored without human confirmation (BR-INV-11).

## Options Considered

1. **Claude (Anthropic)**
   - Vision and structured output validated against a schema; good Spanish.
   - API key and pay-per-use cost; photos leave for a third party.

2. **Local vision model with Ollama**
   - No keys or cost, and data does not leave (like the embeddings, ADR-006).
   - Several GB of model; on CPU, far above 15 seconds, and less reliable extraction.

3. **OpenAI**
   - Equivalent capabilities with the same drawbacks as Claude.

## Decision

Use **Claude** (option 1) behind two ports of the invoices module: `DocumentExtractor` and `DiscrepancyExplainer`.

- Model `claude-opus-5-5` with `low` effort: extracting and drafting do not require deep reasoning, and this keeps latency lower.
- Structured output (`output_config.format`) with a Zod schema. The server then normalizes the amounts and validates them with the same Zod schemas as manual entry; whatever does not comply is left empty and flagged as low confidence.
- Server-side fallback on refusals (`fallbacks: "default"`): if the model declines a document, the API retries with another model within the same call.
- Only the document is sent, never other cooperative data. Extraction stores nothing: it returns a proposal and the file is sent again when the registration is confirmed.
- Without `ANTHROPIC_API_KEY`, extraction responds 503 and explanations are left empty. The rest of the module works the same. Tests use doubles of the ports.
- Embeddings remain local (ADR-006): they are the high-volume part and do not need vision.

## Consequences

### Positive

- Reliable and fast extraction, with two-level schema validation.
- The same provider can serve the Milestone 5 assistant.

### Negative

- Pay-per-use cost and an external dependency.
- Photos of delivery notes and invoices, which may include data of self-employed people, are sent to Anthropic. The thesis report must justify the provider, its retention policy and sending only the minimum necessary (requirements/05, section 4).

## References

- [requirements/05-invoices-and-delivery-notes.md](../requirements/05-invoices-and-delivery-notes.md)
- [ADR-006](ADR-006-local-model-embeddings.md)
