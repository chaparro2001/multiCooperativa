# ADR-003: Multi-cooperative with a shared database

**Date**: 2026-10-04

**Status**: Accepted

## Context

A single backend and a single app serve several cooperatives. Each one has its own members, announcements, assemblies, documents, invoices and delivery notes, which must not be visible to the others. The same person may belong to more than one cooperative.

Isolation also affects the AI assistant: the documents indexed for RAG and the tools that read data must respect the user's cooperative.

## Options Considered

1. **One database per cooperative**
   - Maximum isolation.
   - Migrations and operations multiplied by the number of cooperatives.

2. **One PostgreSQL schema per cooperative**
   - Good isolation.
   - Awkward fit with Prisma and per-schema migrations.

3. **Shared database with a `cooperativeId` column**
   - A single database and a single set of migrations.
   - Isolation depends on every query filtering by cooperative.

## Decision

Use a **shared database with a `cooperativeId` column** in all business tables (option 3).

## Rationale

- **Minimal operating cost**: one database and one deployment, in line with the deadline.
- **Shared users**: a user with memberships in several cooperatives is modeled naturally.
- **Verifiable isolation**: it is concentrated in one place (the cooperative context of each request) and covered by automated tests.

## Consequences

### Positive

- A new cooperative is onboarded without touching infrastructure.
- Simple queries and migrations.

### Negative

- A forgotten filter exposes data from another cooperative. This is the main risk of the design.
- No physical isolation or per-cooperative backups.

### Mandatory measures

1. The active cooperative travels in the route (`/cooperatives/{cooperativeId}/...`) and is validated against the user's memberships before the use case runs.
2. Repositories always receive the cooperative context; there is no read method without it.
3. The fragments indexed in pgvector carry `cooperativeId`, and the RAG search filters by it.
4. A resource from another cooperative answers 404, not 403, so as not to reveal that it exists.
5. Isolation test suite: every endpoint is tested with a user from another cooperative.

### Optional reinforcement

PostgreSQL Row Level Security as a second barrier, if time remains after the feature freeze.

## References

- Master's program, Security: OWASP Top 10, Broken Access Control.
