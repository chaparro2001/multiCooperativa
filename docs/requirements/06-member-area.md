# Requirements · 06 · Member area

**Date**: 2026-10-04 · **Status**: Accepted and implemented (US-MEM-01..04, backend module `members`; the "Could" items are not).

Member record and their contributions to the share capital. In the MVP it is **read-only** for the member; the data is loaded by the cooperative.

Permissions: module `member_area`. The member reads their own data; the governing board reads everything; manager and administrator manage everything.

## 1. User stories

### Must

#### US-MEM-01 · See my record

As a member, I want to see my data in the cooperative.

- **Given** my membership, **when** I open the member area, **then** I see member number, joining date, profile and contact details.

#### US-MEM-02 · See my contributions

As a member, I want to see how much I have contributed to the share capital and the detail of each movement.

- **Given** my capital movements, **when** I consult them, **then** I see the total capital and the list of movements with date, type, concept and amount.
- **Given** that I have no movements, **when** I consult, **then** I see zero capital and an explanatory message.

#### US-MEM-03 · Register capital movements

As a manager, I want to register a member's contributions and refunds.

- **Given** a member of my cooperative, **when** I register a movement with date, type, concept and positive amount, **then** it is added to their history and their capital is recalculated.
- **Given** a refund greater than the member's available capital, **when** I try to register it, **then** it is rejected.

### Should

#### US-MEM-04 · See the capital of all members

- **Given** read permission with "all" scope, **when** I open the list, **then** I see each member's capital and the cooperative's total.

### Could

- Export the contributions statement to PDF.
- Let the member request an update of their contact details.

### Won't

- Editing of their data by the member.
- Calculation of interest or cooperative returns.
- Process of joining or leaving as a member.

## 2. Business rules

| Id        | Rule                                                                                      |
| --------- | ----------------------------------------------------------------------------------------- |
| BR-MEM-01 | Capital movements are immutable. A mistake is corrected with a movement of opposite sign. |
| BR-MEM-02 | Types: mandatory contribution, voluntary contribution, refund, correction.                |
| BR-MEM-03 | Member's capital = sum of contributions − refunds ± corrections. Never negative.          |
| BR-MEM-04 | Amounts in euros with exact decimals.                                                     |
| BR-MEM-05 | Contributions do not influence the right to vote (BR-ASM-01).                             |

## 3. Model

```mermaid
erDiagram
    MEMBERSHIP ||--o{ CAPITAL_MOVEMENT : records

    CAPITAL_MOVEMENT {
        uuid id
        uuid cooperativeId
        uuid membershipId
        date date
        enum type
        string concept
        decimal amount
        uuid recordedBy
        datetime recordedAt
    }
```

(Types in code: `mandatory_contribution`, `voluntary_contribution`, `refund`, `correction`.)

The member number, joining date and member status live in the membership (see [01-access-and-profiles.md](01-access-and-profiles.md)).

## 4. API

| Method | Route                                                                        | Use                   | Level    |
| ------ | ---------------------------------------------------------------------------- | --------------------- | -------- |
| GET    | `/cooperatives/{cooperativeId}/member-area/me`                               | My record and capital | Read own |
| GET    | `/cooperatives/{cooperativeId}/member-area/me/movements`                     | My movements          | Read own |
| GET    | `/cooperatives/{cooperativeId}/member-area/members`                          | List with capital     | Read all |
| GET    | `/cooperatives/{cooperativeId}/member-area/members/{membershipId}/movements` | A member's movements  | Read all |
| POST   | `/cooperatives/{cooperativeId}/member-area/members/{membershipId}/movements` | Register movement     | Manage   |

(The routes live under `member-area` so as not to collide with the user management routes `/members` of [01-access-and-profiles.md](01-access-and-profiles.md).)

## 5. Screens

1. My record with total capital.
2. Capital movements.
3. Members list and movement registration (manage level).

## 6. Implementation decisions

Where the specification above is silent, the implementation (module `apps/api/src/modules/members`, contracts in `packages/contracts/src/member-area.ts`) does this:

- **Scopes**. Reading needs `member_area` read. With scope `own` the caller only has their own record: `me`, `me/movements` and `members/{their own membershipId}/movements`; another member's id answers 404 (not 403) and `GET .../members` answers 403 (it is an "all" operation). With scope `all` (board, manager, administrator) any partner of the cooperative can be consulted. Registering needs `manage` with scope `all`; the governing board (read, all) answers 403.
- **Who has capital**. The memberships with `isPartner = true` that are not `removed` (invited and suspended partners included, with zero capital if they have no movement). A movement can only be registered for them; any other membership, from the same or another cooperative, answers 404. `me` works for any membership with the module: a manager who is not a partner sees their record and no capital.
- **Amount sign**. Contributions and refunds are stored positive and the type gives the sign (BR-MEM-03). A correction carries its own sign (non-zero, positive or negative), which is how "a movement of opposite sign" (BR-MEM-01) is registered. A refund or a negative correction that would leave the capital below zero is rejected with 409 `insufficient_capital` (`details.available`); the check and the insert are atomic per member (advisory lock), so two simultaneous refunds cannot both pass.
- **Immutability**. There is no update or delete use case, and a database trigger refuses `UPDATE` and `DELETE` on `CapitalMovement`; a `CHECK` keeps contributions and refunds positive and no amount zero.
- **Joining date**. `Membership.joinedAt` (nullable `DATE`); when it is not set, the membership's creation date is shown.
- **Contact details**. The user's name and email (the platform stores no phone number).
- **Total capital** of the cooperative (US-MEM-04) is the sum of its partners' capital, computed on every request.
- **Errors**: 400 `invalid_request` (body out of contract, e.g. a malformed amount or date) or `invalid_movement` (rule violated: zero or negative amount, empty or too long concept, amount over 9,999,999,999.99), 403 `forbidden`, 404 `not_found`, 409 `insufficient_capital`.
- **App**: `/member-area` (my record, capital and movements); with scope `all`, `/member-area/members` (searchable list with the cooperative's total) and `/member-area/members/{id}`; with manage, `/member-area/members/{id}/register`.
- **Assistant**: the `my_contributions` tool (requirements/07) calls the module's read facade with the caller's context: always the caller's own capital, whatever their scope.

## 7. Test strategy

- **Domain** (`capital.test.ts`): capital calculation, rejection of refunds that leave negative capital, immutability.
- **Permissions**: a member does not see another member's record (404); the governing board reads but does not register (403).
