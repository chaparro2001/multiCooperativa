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

## Milestone 2 · Announcements and documents (9–11 Oct)

Specifications: [02-announcements](requirements/02-announcements.md) · [03-documents](requirements/03-documents.md)

- [x] File storage with signed URLs (port + adapter).
- [x] Announcements: domain, API, reads, `AnnouncementPublished` event.
- [x] Documents: domain, versions, API.
- [x] Indexing: text extraction, chunking, embeddings, pgvector with `cooperativeId`.
- [x] App: announcements list and detail; documents list and viewer; editor for managers.

## Milestone 3 · Assemblies (12–14 Oct)

Specification: [04-assemblies](requirements/04-assemblies.md)

- [x] Domain with TDD: table of quorum and majority cases from section 9.
- [x] Call to meeting, items, census, votes with a unique constraint in the database.
- [x] API and events.
- [x] App: list, detail, vote, result; editor and voting control for managers.

## Milestone 4 · Invoices and delivery notes (14–17 Oct)

Specification: [05-invoices-and-delivery-notes](requirements/05-invoices-and-delivery-notes.md)

- [x] Domain with TDD: third-party type by operation, totals balancing, invoicing uniqueness, reconciliation with tolerance, statuses, due dates, tax ID validation. Exact decimal amounts.
- [x] Third parties: create, edit and deactivate.
- [x] API for purchase and sales delivery notes and invoices, payments and collections summary.
- [x] Idempotent daily due-date process.
- [x] Vision extraction: port, adapter (Gemini, ADR-009), output validated with the Zod schema.
- [x] AI explanation of discrepancies.
- [x] App: summary, purchases and sales, details, third parties, camera capture and review.
- [ ] Claims (if there is margin).

## Milestone 5 · AI assistant and member area (17–20 Oct)

Specifications: [06-member-area](requirements/06-member-area.md) · [07-ai-assistant](requirements/07-ai-assistant.md)

- [x] Member area: capital movements, read access by scope (own/all) and registration by management (`members` module, US-MEM-01..04).
- [x] Language model port and adapter (Gemini, ADR-009).
- [x] Tools filtered by permissions reusing the use cases (including `my_contributions`, over the member area).
- [x] RAG with citations.
- [x] Conversations and usage limit.
- [x] Evaluation set of 23 questions (`pnpm --filter @multicooperativa/api ai:eval`).
- [x] App: chat with citations and links.

## Milestone 6 · Notifications and feature freeze (20–22 Oct)

- [ ] Notifications module: device tokens and event consumption.
- [ ] Push in the app and navigation to the resource from the notification.
- [ ] Sentry in app and backend.
- [ ] Free hosted demo: API and its services in Docker on a home server exposed with Cloudflare Tunnel, and the web export on GitHub Pages ([04-deployment.md](04-deployment.md), ADR-012; Render/Neon/Supabase remain an optional alternative, ADR-010); native binaries with EAS Build are optional.

## Milestone 7 · Quality and delivery (23–25 Oct)

- [ ] E2E with Maestro: login, cooperative switch, vote, scan and register an invoice, ask the assistant.
- [ ] Security review with the master's OWASP Top 10.
- [ ] Coverage and complexity report.
- [ ] Thesis report.
- [ ] Demo video.

## Cut order if there is a delay

1. Claims.
2. Member area (leave only read access to sample data).
3. Qualified majorities and second call.

**Not cut**: profiles, invoices with scanning and the AI assistant.
