# 03 · Implementation plan

**Date**: 2026-10-04 · **Status**: Accepted

Plan by milestones to run with Claude Code. Each task is small enough for one session and ends with green tests and a commit. It is marked `[x]` when completed.

**Feature freeze**: 22/10. **Delivery**: 26/10.

## Milestone 0 · Foundations (5–6 Oct)

- [x] pnpm monorepo with `apps/mobile`, `apps/api`, `packages/contracts`, shared strict TypeScript.
- [x] ESLint and Prettier; rule that prevents importing between backend modules except through their public interface.
- [x] Husky with lint and tests on pre-commit.
- [x] `apps/api`: HTTP server, configuration through environment variables validated with Zod, health endpoint.
- [x] Local PostgreSQL with Docker Compose (image with pgvector) and Prisma initialized.
- [x] Vitest configured in `apps/api` and `packages/contracts`.
- [x] `apps/mobile`: Expo project with Expo Router and TypeScript; injected configuration (API URL).
- [x] GitHub Actions: install, lint, typecheck and tests on every push.
- [x] In-process internal event bus.
- [x] English codebase and localized UI ([ADR-008](adr/ADR-008-english-codebase-and-localized-ui.md)): code, files, paths, enum values (migration), API routes, docs and spec IDs in English; app texts moved to i18next catalogs with Spanish as the default locale.

## Milestone 1 · Access and profiles (6–9 Oct)

Specification: [requirements/01-access-and-profiles.md](requirements/01-access-and-profiles.md)

- [x] Domain with TDD: permissions (level and scope), membership statuses, last administrator, invitation, lockout after failed attempts.
- [x] Prisma schema: user, cooperative, membership, profile, permission, session, invitation, audit.
- [x] Cooperative onboarding script with its 4 predefined profiles and an administrator.
- [x] Authentication: login, rotating refresh, logout, accept invitation (Argon2id, JWT).
- [x] Cooperative context middleware and permission guards per use case (deny by default).
- [x] Member endpoints: list, invite, change profile, suspend, reactivate.
- [x] `GET /cooperatives/{cooperativeId}/me/permissions`.
- [x] Parameterized test of the profiles × modules matrix and isolation test between cooperatives.
- [x] App: login, secure token storage, automatic renewal, cooperative selector, permission-based navigation, biometrics.
- [x] App: members screens (list with search and status filter, detail with profile change, suspend, reactivate and resend invitation, invite form; US-ACC-08 to US-ACC-10).
- [x] Sample data: two cooperatives with users of each profile.
- [x] Per-cooperative branding (US-ACC-14, ADR-018): `branding` module (colour with WCAG AA contrast check, audited; the PNG/JPEG logo of the first version was removed, see ADR-021), branding provider in the app that themes buttons, links, header and selected states and Settings → Appearance for administrators.
- [x] App UI kit on react-native-paper (ADR-020): Material Design 3 theme derived from the cooperative's colour, `src/ui` rebuilt on Paper with the same props, MaterialCommunityIcons instead of Ionicons. All screens are migrated; light theme only.
- [x] Remove the per-cooperative logo (ADR-021, supersedes the logo part of ADR-018; BR-ACC-17 removed): upload endpoints, validation, storage use, `logoUrl`, home logo and Settings block deleted; migration `remove_cooperative_logo` drops the two columns; the primary colour stays.

## Milestone 2 · Announcements and documents (9–11 Oct)

Specifications: [02-announcements](requirements/02-announcements.md) · [03-documents](requirements/03-documents.md)

- [x] File storage with signed URLs (port + adapter).
- [x] Announcements: domain, API, reads, `AnnouncementPublished` event.
- [x] Documents: domain, versions, API.
- [x] Republish a withdrawn document (US-DOC-08).
- [x] Indexing: text extraction, chunking, embeddings, pgvector with `cooperativeId`.
- [x] Hybrid retrieval (vector + Spanish full-text, RRF) and minimum similarity threshold (ADR-022).
- [x] RAG quality (ADR-023): retrieval benchmark `rag:eval` (NFR-DOC-05, real pipeline, 42 golden questions); accent-insensitive full text (`unaccent`); structure-aware chunking with section and title header (reindex on deploy through the migration); per-document diversity and neighbour expansion for the assistant; Gemini vector floor 0.60; standalone-query rule for follow-ups and 3 multi-turn evaluation cases. No new dependency (`unaccent` is a PostgreSQL contrib extension; `pdf-lib`, already a dependency, builds the benchmark PDFs).
- [x] App: announcements list and detail; documents list and viewer; editor for managers.

## Milestone 3 · Assemblies (12–14 Oct)

Specification: [04-assemblies](requirements/04-assemblies.md)

- [x] Domain with TDD: table of quorum and majority cases from section 9.
- [x] Call to meeting, items, census, votes with a unique constraint in the database.
- [x] API and events.
- [x] App: list, detail, vote, result; editor and voting control for managers.
- [x] Reschedule a called assembly (US-ASM-09, BR-ASM-12): notice from now, no voting opened, previous call kept, `AssemblyRescheduled` event and automatic announcement (optional) from the announcements module.

## Milestone 4 · Invoices and delivery notes (14–17 Oct)

Specification: [05-invoices-and-delivery-notes](requirements/05-invoices-and-delivery-notes.md)

- [x] Domain with TDD: third-party type by operation, totals balancing, invoicing uniqueness, reconciliation with tolerance, statuses, due dates, tax ID validation. Exact decimal amounts.
- [x] Third parties: create, edit and deactivate.
- [x] API for purchase and sales delivery notes and invoices, payments and collections summary.
- [x] Idempotent daily due-date process.
- [x] Vision extraction: port, adapter (Gemini, ADR-009), output validated with the Zod schema.
- [x] AI explanation of discrepancies.
- [x] App: summary, purchases and sales, details, third parties, camera capture and review.
- [x] Three independently configurable and disableable alerts per cooperative (invoice notice, delivery note deadline and its notice, BR-INV-15), attention counts and home badges for invoices and delivery notes (BR-INV-16), unread announcements badge (US-ANN-08).
- [ ] Claims (if there is margin).

## Milestone 5 · AI assistant and member area (17–20 Oct)

Specifications: [06-member-area](requirements/06-member-area.md) · [07-ai-assistant](requirements/07-ai-assistant.md)

- [x] Member area: capital movements, read access by scope (own/all) and registration by management (`members` module, US-MEM-01..04).
- [x] Language model port and adapter (Gemini, ADR-009).
- [x] Tools filtered by permissions reusing the use cases (including `my_contributions`, over the member area).
- [x] RAG with citations.
- [x] Conversations and usage limit.
- [x] Evaluation set of 26 questions (`pnpm --filter @multicooperativa/api ai:eval`).
- [x] App: chat with citations and links.
- [x] Conversation history: list, reopen, new conversation and delete (US-AI-04).

## Milestone 6 · Notifications and feature freeze (20–22 Oct)

- [ ] Notifications module: device tokens and event consumption.
- [ ] Push in the app and navigation to the resource from the notification.
- [ ] Sentry in app and backend.
- [ ] Free hosted demo: API and its services in Docker on a home server exposed with Cloudflare Tunnel, and the web export on GitHub Pages ([04-deployment.md](04-deployment.md), ADR-012; Render/Neon/Supabase remain an optional alternative, ADR-010); native binaries with EAS Build are optional.

## Performance after the freeze (22 Oct)

- [x] Keyset pagination (`{ items, nextCursor }`, `limit` and `before`, like the assistant history) of delivery notes, invoices, documents, members and a member's capital movements, with composite indexes starting with `cooperativeId`; totals, summaries and badges stay computed by the server. The mobile lists are `FlatList`/`SectionList` with `useInfiniteQuery`. No new dependency.
- [x] Document search debounced 300 ms (`useDebouncedValue`) with `keepPreviousData`, so the lists do not flash while typing.

## Design system migration (22–24 Oct)

Adopts [design-system/](design-system/README.md) in `apps/mobile` ([ADR-024](adr/ADR-024-adopt-the-design-system.md)); gap analysis and phases in [06-design-system-migration.md](06-design-system-migration.md). Visual change; same data, copy, permissions and Maestro selectors.

- [x] Phase 0 (`cda78ab`): tokens in `ui/theme.ts` (`space`, `radius`, `size`, `shadow`, `layout`, `scrim`, `focusRing`), `colors.surface` renamed `surfaceVariant`, nine rounded values of `tokens.json`/`tokens.css` corrected, theme tests.
- [x] Phase 1 and 2 (`7d81302`, `be37041`): complete kit in `src/ui` (base components, cards and rows, banners, progress and votes, map card, assistant pieces, action bar, states and skeletons) with a reference in `src/ui/README.md`.
- [x] Phase 3 (`93212d2`, `27d13d6`, `5207744`, `c254d5c`, `5b485eb`, `3eebdf9`, `90f6694`): screens on the kit (home, announcements, assemblies, invoices, entry, capture and register, member area and members, documents, assistant, settings).
- [x] Behaviour items (`93212d2`, `27d13d6`, `5207744`, `5b485eb`, `90f6694`, `b17e96b`): home attention strip, "Cómo llegar" map card, cooperative colour dot, admin Settings sub-pages, quorum mark, sticky action bar in the register form.
- [x] Regression: lint, typecheck, 1338 unit tests, Expo web at 390 and 960 as administrator and member, no console errors. Outcome and deviations in [06-design-system-migration.md](06-design-system-migration.md#9-outcome).
- [ ] Re-run `pnpm e2e` (Maestro) after the migration and take screenshots for the report.

## Milestone 7 · Quality and delivery (23–25 Oct)

- [x] E2E with Maestro (`apps/mobile/.maestro`, `pnpm e2e`, local only): login and home tiles, cooperative switch, vote in an open assembly, invoices summary and purchase/sale switch. Scanning an invoice and the assistant are not covered (they need the camera and an LLM). Reason for the dependency changes: Maestro is an external CLI (not an npm dependency); `pnpm-workspace.yaml` overrides `expo-modules-jsi` to 57.1.3 because 57.1.1 does not compile with Xcode 26 (Swift 6.2), which blocks any iOS development build.
- [ ] Security review with the master's OWASP Top 10.
- [ ] Coverage and complexity report.
  - [x] `@vitest/coverage-v8` (dev dependency, same version as Vitest): `pnpm test:coverage` prints a text summary and writes an HTML report to `coverage/` (ignored by Git); CI shows the summary in the unit-test step. Reason: measurable quality evidence for the thesis report; no thresholds. Unit tests only: 45% statements overall (api 59%, mobile 26%, contracts 99%).
  - [x] `eslint-plugin-react-hooks` (root dev dependency, v7 flat `recommended`, scoped to `apps/mobile`): Rules of Hooks, `exhaustive-deps` and the React Compiler rules (`set-state-in-effect`, `refs`, `purity`). Reason: `app.json` enables `reactCompiler`, which silently skips code it cannot optimise; the lint makes that visible. Existing findings fixed (server data seeded into forms by adjusting state during render, latest-value refs written in effects); the few intentional effects carry a targeted `eslint-disable` with the reason.
- [ ] Thesis report.
- [ ] Demo video.

## Cut order if there is a delay

1. Claims.
2. Member area (leave only read access to sample data).
3. Qualified majorities and second call.

**Not cut**: profiles, invoices with scanning and the AI assistant.
