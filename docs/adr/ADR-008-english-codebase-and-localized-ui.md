# ADR-008: English codebase and documentation, localized app UI

**Date**: 2026-10-04

**Status**: Accepted

## Context

Until now the repository mixed languages: code identifiers in English, but documentation, commit messages, file names, enum values, API routes, spec identifiers (`HU-`, `RN-`, `RNF-`) and app texts in Spanish. The mix makes the code harder to read, forces constant translation decisions, and leaves the project hard to share or evaluate outside a Spanish-speaking context.

Constraints:

- The end users of the app are Spanish-speaking, and other languages may be added later.
- The project is already under way: there are applied database migrations, existing enum values in PostgreSQL and a documented API.
- Applied migrations must not be edited.
- Some user-facing text is generated on the server (push notifications).

## Options Considered

1. **Keep Spanish for documentation, commits and domain vocabulary**
   - No migration effort.
   - Keeps the language mix and hardcoded user-facing texts, and makes adding another UI language costly.

2. **Translate only the code (identifiers, enum values, routes)**
   - Smaller effort than a full change.
   - Documentation, specs and commits would still be in Spanish, so a requirement ID or a doc term would not match the code vocabulary.

3. **Everything in English, with the app UI localized through i18n**
   - A single technical language for code, docs, specs, commits and API.
   - User-facing texts live in translation catalogs; adding a language is adding a catalog.
   - One-off migration effort across code, docs and database enums.

## Decision

Adopt **everything in English except the texts shown to end users in the app** (option 3).

- **English** for: code, identifiers, file names, paths, enum values, API routes, documentation and commit messages (Conventional Commits in English).
- **Spec identifiers**: `US-` (user story), `BR-` (business rule) and `NFR-` (non-functional requirement), with module codes `ACC` (access and profiles), `ANN` (announcements), `DOC` (documents), `ASM` (assemblies), `INV` (invoices and delivery notes), `MEM` (member area) and `AI` (AI assistant). Example: `US-ACC-02`, `BR-INV-06`, `NFR-ANN-03`.
- **App localization** with `i18next` + `react-i18next` + `expo-localization`. Spanish (`es`) is the default and fallback locale. Catalogs live in `apps/mobile/src/i18n/locales/`. User-facing texts are never hardcoded: they go through `t('key')`.
- **API errors** return stable error codes plus English developer messages; the app maps the codes to localized text.
- **Server-generated user-facing text** (push notifications) goes through a small server-side message catalog, with the locale resolved per recipient and Spanish as the default.
- **Enum values** are renamed to English through a **new migration** (`ALTER TYPE ... RENAME VALUE`). Existing migrations are not edited.
- Tenant data (cooperative names, people, emails) is not translated; the seed keeps its values.

## Rationale

- **One technical language** removes the translation decisions at every layer and makes the code, specs and API consistent.
- **Spanish users are not affected**: the visible texts remain in Spanish through the default locale, and a new language is a new catalog.
- **Renaming enum values with `RENAME VALUE`** preserves existing rows and avoids rewriting migration history.
- **Stable error codes** decouple the API from the UI language.

## Consequences

### Positive

- Consistent vocabulary between docs, specs, code, API and commits.
- Adding a UI language only requires a new catalog (and server messages for push).
- Easier to share and evaluate the project outside a Spanish-speaking context.

### Negative

- One-off effort to rename files, identifiers, routes, enum values and spec IDs, with a risk of mismatches while the change is in progress.
- Existing links and references to the old Spanish names (documents, commit history) become outdated; history keeps the old names.
- Texts must be maintained in catalogs, and server-side push messages need their own catalog.

### Derived rules

- The documentation and `CLAUDE.md` are updated in the same change as the code.
- A new user-facing text is added to the catalog of every supported locale (at least `es`).
- An ADR that was accepted is not edited in its decision; this one does not alter the earlier decisions, only their language.

## References

- [docs/02-stack-and-architecture.md](../02-stack-and-architecture.md)
- [docs/03-implementation-plan.md](../03-implementation-plan.md)
