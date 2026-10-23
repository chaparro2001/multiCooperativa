# multiCooperativa

Master's thesis (TFM) of the Master's in AI-Driven Development (BIG school). Multi-cooperative mobile app for iOS and Android that connects each cooperative with its members (announcements, documents, assemblies with voting, member area) and gives it control of delivery notes and invoices with its suppliers and customers, with an AI assistant that respects each user's permissions.

Delivery: 26/10/2026. Feature freeze: 22/10/2026.

## Documentation (source of truth)

Read before implementing any module:

- Vision and scope: `docs/01-vision-and-scope.md`
- Stack and architecture: `docs/02-stack-and-architecture.md`
- Plan by milestones (tick tasks when completed): `docs/03-implementation-plan.md`
- Design system, before any UI work: `docs/design-system/README.md` and `screens.md` (ADR-024; migration record in `docs/06-design-system-migration.md`)
- Decisions: `docs/adr/`
- Specification of each module: `docs/requirements/`

If the code and the documentation do not match, stop and ask. If a decision changes, the documentation is updated in the same commit; an architecture change creates a new ADR, never edits an accepted one.

## Stack

- App: Expo + React Native + TypeScript, Expo Router, react-native-paper (Material Design 3) behind the design-system kit in `src/ui` (ADR-024), TanStack Query, i18next + react-i18next + expo-localization.
- Backend: Node + TypeScript, modular monolith with Clean Architecture.
- Data: PostgreSQL, Prisma, pgvector.
- Contracts: Zod schemas in `packages/contracts`, used by app and backend.
- Tests: Vitest (unit and integration); Maestro E2E flows on the iOS simulator (`apps/mobile/.maestro`, local only; `docs/02-stack-and-architecture.md`); React Native Testing Library planned, not delivered.
- Delivery: GitHub Actions, free hosted demo (home server with Docker and Cloudflare Tunnel, GitHub Pages; `docs/04-deployment.md`, ADR-012), EAS Build, Sentry.

## Structure

```
apps/mobile          Expo app
apps/api             Backend
packages/contracts   Shared schemas and types
docs/                Specifications, ADRs and plan
```

Each backend module lives in `apps/api/src/modules/<module>/` with the `domain/`, `application/`, `infrastructure/` layers and an `index.ts` as the only public interface.

## Non-negotiable rules

1. **The backend is the permissions authority.** Every use case receives the context (user, cooperative, permissions) and denies by default. The app only hides.
2. **Isolation per cooperative.** Every repository requires `cooperativeId`. Reads without it do not exist. A resource from another cooperative or outside the scope answers 404; a module without permission, 403.
3. **Pure domain.** `domain/` does not import Prisma, the HTTP framework or any external SDK.
4. **Between modules**: only through its `index.ts` or through internal events. Never the tables of another module.
5. **Amounts** with exact decimals, never floating-point `number`.
6. **AI**: keys only in the backend; no data extracted by AI is persisted without human confirmation; the assistant's tools are read-only and reuse the use cases with the user's permissions.
7. **Secrets** outside the repository. Only `.env.example` is versioned.
8. **Language**: everything in the repository is in English (code, identifiers, files, paths, enum values, API routes, docs and commit messages). Only the texts shown to end users in the app are localized (see below). Decision in `docs/adr/ADR-008-english-codebase-and-localized-ui.md`.
9. **No hardcoded user-facing texts.** They go through i18n (`t('key')`) with catalogs in `apps/mobile/src/i18n/locales/` (`es` is the default and fallback locale). The API returns stable error codes plus English developer messages; the app maps the codes to localized text. Text generated on the server (push notifications) goes through the server-side message catalog.

## Way of working

- TDD in the domain: test first with the Given/When/Then criteria of the specification.
- Use the specification identifiers (`US-ACC-02`, `BR-INV-06`, `NFR-ANN-03`) in test names and commit messages. Prefixes: `US-` user story, `BR-` business rule, `NFR-` non-functional requirement. Module codes: `ACC`, `ANN`, `DOC`, `ASM`, `INV`, `MEM`, `AI`.
- Small commits with Conventional Commits in English: `feat(access): login lockout after failed attempts (US-ACC-02)`.
- Before considering a task done: lint, typecheck and tests green.
- Code, identifiers, documentation and commit messages in English; app texts localized through i18n (Spanish by default).

## Community skills

Third-party skills live in `.agents/skills/` (linked from `.claude/skills/`, pinned in `skills-lock.json`; install with `npx skills add <owner/repo@skill>`). They are general guidance: when one conflicts with this file, an ADR or a specification, this file, the ADR and the specification win. Do not edit them by hand. Known deviations:

- `nodejs-backend-patterns`, `architecture-patterns`: ignore their folder layouts (`controllers/`, `services/`, `use_cases/`, `adapters/`); modules keep `domain/`, `application/`, `infrastructure/` and `index.ts`.
- `supabase-postgres-best-practices`: isolation per cooperative is enforced in the repositories with `cooperativeId` (ADR-003), not with RLS policies. Supabase-specific notes do not apply.
- `vercel-react-native-skills`: do not add FlashList, `expo-image`, Galeria or Nativewind without an ADR; layout styling uses `StyleSheet.create`, and UI components come from `react-native-paper` (ADR-020) through `src/ui` (colours with `useTheme()`, icons are `MaterialCommunityIcons`); `eslint-plugin-react-hooks` (incl. the React Compiler rules) is enforced on `apps/mobile` by `pnpm lint`: no setState in effects to seed state from props or server data (adjust during render), no refs written in render.
- `prisma-client-api`: the client is generated in `apps/api/src/generated/prisma`; amounts keep using `Decimal`.
- No skill justifies adding a dependency: a new dependency needs a reason in the plan or an ADR.

## Commands

Requirements: Node 24 (`.nvmrc`), pnpm and Docker.

```bash
pnpm install                 # installs and generates the Prisma client
pnpm db:up                   # PostgreSQL with pgvector, S3 storage (RustFS) and Ollama with Docker Compose
pnpm ai:pull                 # downloads the bge-m3 embeddings model into Ollama (once)
pnpm ai:pull:chat            # downloads the assistant's local chat model (qwen3:8b, ~5 GB) for ASSISTANT_LLM_PROVIDER=ollama
pnpm --filter @multicooperativa/api db:migrate   # applies or creates migrations
pnpm --filter @multicooperativa/api db:seed      # sample data (docs/sample-data.md)
pnpm --filter @multicooperativa/api db:seed:content  # sample documents and announcements, through the API (hosted demo)
pnpm --filter @multicooperativa/api jobs:due-dates  # invoice due dates (the API already runs it every hour)
pnpm --filter @multicooperativa/api ai:eval      # evaluation set of the assistant (NFR-AI-05); --offline without GEMINI_API_KEY
pnpm --filter @multicooperativa/api rag:eval    # retrieval benchmark of the RAG (NFR-DOC-05): real pipeline, Gemini embeddings by default (needs GEMINI_API_KEY and db:up; --sweep for thresholds)
pnpm --filter @multicooperativa/api dev          # API at http://localhost:3000
pnpm --filter @multicooperativa/mobile start     # Expo app

pnpm lint                    # ESLint (includes the boundaries between modules)
pnpm format                  # Prettier
pnpm typecheck
pnpm test                    # unit tests (no database) plus the type-level tests of packages/contracts (*.test-d.ts)
pnpm test:coverage           # unit tests with a v8 coverage summary; HTML report in coverage/ (no thresholds)
pnpm e2e                     # Maestro flows (iOS simulator; needs Maestro, JDK 17, the API and `npx expo run:ios`; see docs/02-stack-and-architecture.md)
pnpm test:integration        # *.integration.test.ts tests against the multicooperativa_test DB and the multicooperativa-test bucket (need pnpm db:up; the Ollama ones are skipped if there is no model)
```

Integration tests run in CI (after `db:deploy`) and locally with `pnpm test:integration` once `pnpm db:up` is running. They are not part of the pre-commit hook (lint, typecheck and unit tests only).

Environment variables: copy `apps/api/.env.example` and `apps/mobile/.env.example` to `.env`.

The AI assistant needs `GEMINI_API_KEY` (free key from Google AI Studio, no card; ADR-009) and optionally `GEMINI_MODEL` (default `gemini-3.8-flash`), `GEMINI_FALLBACK_MODELS` (comma-separated, default `gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite`, tried when the main model answers 503/429 after the retries with backoff of `shared/infrastructure/resilient-call.ts`; empty disables it) and `ASSISTANT_MESSAGE_LIMIT_PER_HOUR` (default 30). `ASSISTANT_LLM_PROVIDER=gemini|ollama` (default `gemini`; ADR-013) chooses who answers the assistant's chat: with `ollama` it uses a local model (`ASSISTANT_OLLAMA_MODEL`, default `qwen3:8b`, `OLLAMA_URL`, `ASSISTANT_OLLAMA_TIMEOUT_MS` default 90000; `ASSISTANT_OLLAMA_MODELS`, comma-separated allowlist of models each cooperative's administrator can pick in Settings among those installed, default only `ASSISTANT_OLLAMA_MODEL`; ADR-014) and needs no Gemini key; the home-server stack defaults it to `ollama`, but the published demo overrides it with `gemini` in `.env.server` (ADR-026). A cooperative's administrator can instead bring its own key for a hosted provider (Groq, Mistral, NVIDIA NIM, OpenRouter) in Settings; keys are stored AES-256-GCM encrypted with `ASSISTANT_SECRETS_KEY` (32 bytes in base64, `openssl rand -base64 32`; without it that option is disabled; ADR-019). Invoice extraction and discrepancy explanations always use Gemini. Without the provider's key the assistant answers 503 and the rest of the app works.

Invitations (ADR-016): no email provider. `INVITATION_DELIVERY=console|link` (default `console`) and `WEB_APP_URL` (public web app URL with its base path, required with `link`). With `link` the invite and resend responses carry `invitationUrl` (`${WEB_APP_URL}/invitation?token=…`) only for the inviting administrator, who passes it on; the home-server stack sets `link`. With `console` the link is printed to the API console in development and, in production, inviting answers 503 (tokens are never logged there).

In `apps/mobile`, dependencies are added with `pnpm exec expo install <package>` so that they match the Expo SDK.
