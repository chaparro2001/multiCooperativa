# ADR-011: Bilingual root README for the thesis delivery

**Date**: 2026-10-20

**Status**: Accepted

## Context

[ADR-008](ADR-008-english-codebase-and-localized-ui.md) fixes English for everything in the repository except the texts shown to end users. The official rules of the thesis require a `README.md` at the root with a given set of sections (project description, stack, local setup, structure, features, test users and deliverable links). The evaluator of the master's program reads Spanish.

## Options Considered

1. **English only**, as ADR-008 says. The evaluator would have to translate the main entry point of the delivery.
2. **Spanish only**. It breaks ADR-008 and leaves the English-speaking reader without an entry point.
3. **Two root files**: `README.md` in Spanish (primary, what the platform renders first) and `README.en.md` in English with the same content, linked to each other.

## Decision

Option 3. `README.md` (Spanish) and `README.en.md` (English) live at the repository root, carry the same sections and link to each other at the top. This is a documented, limited exception to ADR-008: it applies only to these two files. Everything else (code, docs, ADRs, commit messages) stays in English.

## Rationale

- The entry point of the delivery is read by a Spanish-speaking evaluator, and the repository remains understandable to anyone else.
- The exception is bounded to two files, so the rest of ADR-008 is untouched. ADR-008 is not edited because accepted ADRs are immutable; this ADR records the exception.

## Consequences

- Any change to one README must be mirrored in the other in the same commit.
- Detailed documentation is not duplicated: both READMEs link to `docs/`, which stays in English.
