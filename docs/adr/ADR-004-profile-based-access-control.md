# ADR-004: Profile-based access control with permissions by module, level and scope

**Date**: 2026-10-04

**Status**: Accepted

## Context

Each cooperative needs to grant access to the app's modules according to each person's role: member, governing board, manager or administrator. Two people with access to the same module may see different data: in the member area, each member sees only their own contributions and the manager sees everyone's.

In addition, some actions do not depend on the role but on membership status in the cooperative: a hired manager who is not a member can manage invoices, but cannot vote in an assembly.

## Options Considered

1. **Fixed roles in code**
   - Fastest to implement.
   - Any permission change requires a deployment; it does not support custom profiles per cooperative.

2. **Profiles with permissions by module, level and scope (RBAC)**
   - Permission = module + level (no access, read, manage) + scope (own, all).
   - Profiles as data, defined per cooperative.
   - Somewhat more model and more tests.

3. **Attribute-based policy engine (ABAC)**
   - Maximum flexibility.
   - Complexity and learning curve out of proportion to the scope.

## Decision

Use **profiles with permissions by module, level and scope** (option 2), with four predefined profiles in the MVP.

## Rationale

- **Meets the requirement**: allows granting module access by profile without touching code.
- **Scope avoids duplicating profiles**: member and manager share the member area and differ in which data they see.
- **Ready to grow**: the model supports custom profiles from day one, even though the editor is not part of the MVP.

## Associated decisions

1. **The backend is the authority.** Each use case checks the permission and denies by default. The app only adapts navigation to what the server returns.
2. **Permissions do not travel in the token.** They are resolved on every request from the membership, so that a profile change or a suspension takes effect immediately.
3. **Voting is not a profile permission.** It depends on the member status recorded in the membership.
4. **The AI assistant inherits the permissions.** Its tools and the RAG search apply the same rules as the rest of the use cases.

## Consequences

### Positive

- Explicit permission matrix that is easy to audit.
- A parameterized test suite (profile by module) demonstrates the absence of Broken Access Control.
- Access changes take effect immediately.

### Negative

- One additional permissions query per request (mitigable with a short-lived cache).
- More combinations to test than with fixed roles.

## References

- [requirements/01-access-and-profiles.md](../requirements/01-access-and-profiles.md)
- Master's program, Security: Broken Access Control; Authentication, authorization and credential management.
