# Thesis documentation · Mobile app for cooperatives

Master's in AI-Driven Development (BIG school) · Delivery: 26/10/2026

This folder collects, in order, what is being decided and specified. Each document is the source of truth for its topic; if a decision changes, it is updated here before the code.

## Index

| Document                                                                                             | Contents                                                                                               | Status              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
| [01-vision-and-scope.md](01-vision-and-scope.md)                                                     | Problem, users, modules, MVP scope, plan and risks                                                     | Accepted            |
| [02-stack-and-architecture.md](02-stack-and-architecture.md)                                         | Final stack, monorepo structure and backend modules                                                    | Accepted            |
| [03-implementation-plan.md](03-implementation-plan.md)                                               | Milestones and tasks to run with Claude Code                                                           | Accepted            |
| [sample-data.md](sample-data.md)                                                                     | Seed data: two cooperatives with one user per profile                                                  | Accepted            |
| [adr/ADR-001-hybrid-app-with-expo.md](adr/ADR-001-hybrid-app-with-expo.md)                           | Hybrid app with Expo that generates the native apps                                                    | Accepted            |
| [adr/ADR-002-modular-monolith.md](adr/ADR-002-modular-monolith.md)                                   | Backend as a modular monolith with Clean Architecture                                                  | Accepted            |
| [adr/ADR-003-multi-cooperative.md](adr/ADR-003-multi-cooperative.md)                                 | Data isolation between cooperatives                                                                    | Accepted            |
| [adr/ADR-004-profile-based-access-control.md](adr/ADR-004-profile-based-access-control.md)           | Profiles with permissions by module, level and scope                                                   | Accepted            |
| [adr/ADR-005-s3-file-storage.md](adr/ADR-005-s3-file-storage.md)                                     | S3-compatible file storage behind a port                                                               | Accepted            |
| [adr/ADR-006-local-model-embeddings.md](adr/ADR-006-local-model-embeddings.md)                       | Embeddings with a local model served by Ollama                                                         | Accepted            |
| [adr/ADR-007-claude-for-vision-and-drafting.md](adr/ADR-007-claude-for-vision-and-drafting.md)       | Claude for vision extraction and drafting explanations                                                 | Accepted            |
| [adr/ADR-008-english-codebase-and-localized-ui.md](adr/ADR-008-english-codebase-and-localized-ui.md) | English codebase and docs; localized app UI (i18n)                                                     | Accepted            |
| [requirements/01-access-and-profiles.md](requirements/01-access-and-profiles.md)                     | Access, sessions, memberships and profiles                                                             | Accepted            |
| [requirements/02-announcements.md](requirements/02-announcements.md)                                 | Board announcements with push                                                                          | Draft to validate   |
| [requirements/03-documents.md](requirements/03-documents.md)                                         | Document repository and indexing for RAG                                                               | Draft to validate   |
| [requirements/04-assemblies.md](requirements/04-assemblies.md)                                       | Calls to meeting, voting, quorum and majorities                                                        | Draft to validate   |
| [requirements/05-invoices-and-delivery-notes.md](requirements/05-invoices-and-delivery-notes.md)     | Suppliers and customers, purchases and sales, reconciliation, payments and collections, vision capture | Accepted in essence |
| [requirements/06-member-area.md](requirements/06-member-area.md)                                     | Member record and capital contributions                                                                | Draft to validate   |
| [requirements/07-ai-assistant.md](requirements/07-ai-assistant.md)                                   | RAG and tool calling with the user's permissions                                                       | Draft to validate   |

The `CLAUDE.md` file at the repository root summarizes the rules for working with Claude Code and points to this folder.

## Conventions

- **Language**: everything in the repository (code, identifiers, files, paths, documentation and commit messages) is in English; only the texts shown to end users in the app are localized (Spanish by default). See [ADR-008](adr/ADR-008-english-codebase-and-localized-ui.md).
- **Requirements**: user stories with acceptance criteria in Given / When / Then format and MoSCoW priority, following the Spec Driven Development approach of the master's program.
- **ADR**: master's program template (context, options, decision, rationale, consequences). They are immutable: a decision that changes produces a new ADR that replaces the previous one.
- **Identifiers**: `US-<module>-NN` for user stories, `BR-<module>-NN` for business rules, `NFR-<module>-NN` for non-functional requirements. Module codes: `ACC` access and profiles, `ANN` announcements, `DOC` documents, `ASM` assemblies, `INV` invoices and delivery notes, `MEM` member area, `AI` AI assistant.
- **Diagrams**: Mermaid inside the Markdown itself.

## Pending confirmation

1. Official statement of the Final Project (deliverables and evaluation criteria).
