# ADR-002: Backend as a modular monolith with Clean Architecture

**Date**: 2026-10-04

**Status**: Accepted

## Context

The backend covers eight functional areas (access and profiles, announcements, assemblies, documents, invoices and delivery notes, member area, AI assistant and notifications) with non-trivial business rules in several of them.

Constraints:

- A single developer and a single deployment on Railway.
- The deadline does not allow operating distributed infrastructure.
- Domain rules must be testable with TDD without a database or network.

## Options Considered

1. **Monolith by technical layers** (controllers, services, repositories)
   - Quick to start.
   - Functional areas get mixed and coupling grows with every module.

2. **Modular monolith with Clean Architecture and internal events**
   - One deployment, modules with explicit boundaries.
   - Domain isolated from frameworks.
   - Requires discipline in dependencies between modules.

3. **Microservices**
   - Independent deployment and scaling.
   - Network latency, eventual consistency, distributed observability and several deployments to maintain.

## Decision

Use a **modular monolith with Clean Architecture**, with communication between modules through public interfaces and internal events (option 2).

## Rationale

- **Proportionality**: the volume and the team do not justify the operational cost of microservices.
- **Testability**: the domain does not depend on Prisma or the HTTP framework, so the rules (quorum, reconciliation, permissions) are tested in memory.
- **Real decoupling**: Notifications reacts to events such as `DeliveryNoteRegistered` or `InvoiceOverdue` without the emitting modules knowing about it.
- **Evolution**: module boundaries are natural candidates for becoming services if they ever need to be extracted.

## Consequences

### Positive

- A single deployment and a single database.
- Simple local debugging and testing.
- Clear migration path towards independent services.

### Negative

- A serious failure can affect the whole process.
- No independent scaling per module.
- Boundaries between modules depend on discipline and lint rules, not on the network.

### Derived rules

- A module imports from another only through its public interface.
- The tables of one module are not queried directly from another.
- Internal events are synchronous in-process during the MVP; the Outbox pattern remains as an evolution if a broker is introduced.

## References

- Master's program, Software Architecture: Modular Monolith, Clean Architecture with TypeScript, Event-Driven Architecture.
