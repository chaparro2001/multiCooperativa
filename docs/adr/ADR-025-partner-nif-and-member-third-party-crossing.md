# ADR-025 · Partner NIF and the crossing of partners with third parties

**Date**: 2026-10-23 · **Status**: Accepted

## Context

Many partners of a cooperative are also its suppliers (they sell it their harvest) or customers. The member area knows people, invoicing knows companies and individuals as third parties, and nothing links them: "how much did we buy from our partners?" cannot be answered. Also the assistant lacked tools to ask about the cooperative's capital and census.

## Decision

1. **NIF on `Membership`**, not on `User`: a person can be a partner of several cooperatives and the NIF is a datum of the partner's record in each one. Column `nif VARCHAR(9)` null, normalized (uppercase, no spaces, dots or hyphens). A partial unique index `(cooperativeId, nif) WHERE status <> 'removed' AND nif IS NOT NULL` makes it unique among live memberships; a removed one releases it. `leftAt DATE` records the day of removal (census of leavers).
2. **One NIF rule**: the pure validator (`isValidNif`, `normalizeNif`) moves to `apps/api/src/shared/domain/nif.ts`, used by invoicing (third parties) and access (partners). `invoicing/domain/nif.ts` re-exports it. Domain stays pure and no module imports another's internals.
3. **API**: the NIF is set in the users module, where partner data is entered: optional `nif` in `POST /members` and `PATCH /members/{id}` with `{ nif }` (null clears it). Errors: `400 invalid_member_nif`, `409 member_nif_taken`. The audit event `member.nif_changed` records that it changed, never the value. The member area record exposes it.
4. **Crossing by NIF through public interfaces**: the assistant's `partner_trade` asks the member area (`partnersWithNif`) and invoicing (`tradeByNif`, which sums per third party in the database) and joins them by NIF in the assistant; no module reads another's tables. It needs member area "all" scope and invoicing read.
5. **Assistant tools** `capital_summary`, `member_census`, `member_detail`, `partner_trade` need "all" scope: `ToolSpec.requires` gains an optional scope and `alsoRequires` for tools that cross modules. The use cases enforce the same scope (403), so hiding the tool is not the only barrier.

## Consequences

- The NIF is personal data: only the partner and "all"-scope profiles see it; the logs and audit do not carry it.
- A partner without NIF is invisible to the crossing; NIF is optional so existing data keeps working. The sample data gives the partners NIFs and one is also a supplier.
- An administrator cannot change their own NIF (BR-ACC-08 applies to every membership change).
