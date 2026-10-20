# 01 · Vision and scope

**Date**: 2026-10-04 · **Status**: Accepted

## Product

Multi-cooperative mobile application that connects each cooperative with its members (information and participation) and gives it control of delivery notes and invoices with its suppliers and customers, with an AI assistant that respects each user's permissions.

It is a standard solution, valid for any type of cooperative (agricultural, housing, worker, consumer). It includes no sector-specific functionality.

## Problem

The member of a cooperative participates little and is poorly informed:

- Calls to meetings arrive by letter or notice board.
- Bylaws, regulations and minutes are not at hand.
- They do not know how much they have contributed to the share capital.
- Delivery notes and invoices with suppliers and customers live on paper, and mismatches between them, as well as overdue payments and collections, are detected late or never.

## Users

| Profile         | Who they are                                   | What they need                                                                                        |
| --------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Member          | Member of the cooperative                      | To be informed, vote, read documents and their contributions                                          |
| Governing board | Governing body                                 | To publish announcements, call assemblies, oversee payments and collections                           |
| Manager         | Administrative staff (may not be a member)     | To register and reconcile delivery notes and invoices from suppliers and customers, control due dates |
| Administrator   | Person in charge of the cooperative in the app | To grant access to users and assign profiles                                                          |

## MVP modules

1. **Access and profiles**: login, biometric unlock, memberships in several cooperatives, four predefined profiles and profile assignment.
2. **Announcements**: publication by the board and reading by members, with push notifications.
3. **Assemblies**: call to meeting, agenda, documentation and advisory voting per item, with quorum and majorities.
4. **Documents**: bylaws, regulations, minutes and annual accounts. They feed the assistant's RAG.
5. **Invoices and delivery notes**: suppliers and customers, purchase and sales delivery notes and invoices, automatic reconciliation, payment and collection control with due dates, and camera capture using a vision model.
6. **Member area**: data and contributions to the share capital, read-only.
7. **AI assistant**: RAG over documents and tool calling over the user's data, filtered by profile and cooperative.

## Nice to have (if time remains)

- Custom profile editor.
- Vote delegation and secret ballot.
- Automatic summary of minutes.

## Out of scope

- Issuing invoices with tax validity. The app tracks and reads, it does not issue.
- Accounting, VAT books and real payments.
- Access for suppliers or customers to the app.
- Member admissions and withdrawals as a corporate process.
- Sector-specific modules (agricultural deliveries, construction, shifts).
- Web administration panel.
- Creating cooperatives from a screen (done by script).
- Offline access.

## Work plan

| Week      | Focus                                                                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5–11 Oct  | Specification, domain and ADRs; monorepo; backend for access, profiles, announcements and documents; CI; app skeleton with login and permission-based navigation |
| 12–18 Oct | Assemblies and voting; invoices and delivery notes with reconciliation; RAG over documents; app screens                                                          |
| 19–25 Oct | Vision scanning and tool calling; push; permission matrix tests; security review; deployment; report and video                                                   |

**Feature freeze**: 22 October. From then on, only fixes, testing and the report.

## Risks

| Risk                                                                      | Mitigation                                                                                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Ambitious scope for one person in 22 days                                 | Agreed cut order: claims, contributions, qualified-majority voting                              |
| React Native learning curve                                               | Daily development against iOS; Android validated on an emulator; AI support for repetitive code |
| Official thesis statement not yet reviewed                                | Check the scope against the statement as soon as it is available                                |
| Third-party data (tax IDs, self-employed people) sent to the vision model | Justify it in the report and minimize what is sent                                              |

**Not cut**: profiles, invoices with scanning and the AI assistant. They are what sets the project apart.

## Assumptions

- Voting in assemblies is advisory or supportive: remote voting with full legal validity requires guarantees that do not fit in the timeframe.
