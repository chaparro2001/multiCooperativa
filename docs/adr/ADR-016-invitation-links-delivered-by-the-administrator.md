# ADR-016: Invitation links delivered by the administrator

**Date**: 2026-10-21

**Status**: Accepted

## Context

US-ACC-08 says the invitation "is sent", and the access module delivers it through an `InvitationSender` port. There are only two adapters: one that prints the link to the API console (development) and one that refuses (production), so on the hosted demo inviting a person answers `503 invitation_delivery_unavailable` although the membership is created, and nobody receives the link.

The hosted demo ([ADR-012](ADR-012-home-server-with-cloudflare-tunnel.md)) is free, public and used with sample data. An email provider needs a verified sending domain or account, and the providers with a usable free tier ask for a card or personal data that this thesis demo does not warrant. Meanwhile the activation screen already works on the web under the base path (`<web app>/invitation?token=…`).

## Options Considered

1. **Email provider (SMTP or transactional API)**: the closest to the specification text and to what a real cooperative would use; needs an account, a sender domain with SPF/DKIM, a secret to store and a card on most plans. Out of reach for the demo.
2. **Link delivered by the administrator**: the API returns the activation link in the invite and resend responses, only to the administrator who issued them; the app shows it with "Copy link" and "Share", and the administrator sends it through whatever channel they use (messaging, email client).
3. **Keep the console adapter and the 503 in production**: nothing to build, but the invitation flow cannot be shown on the hosted demo.

## Decision

Option 2.

- New adapter `LinkInvitationSender` in the access module, chosen with `INVITATION_DELIVERY=console|link` (default `console`). With `link` it builds `${WEB_APP_URL}/invitation?token=<token>` and returns it from the port; `WEB_APP_URL` (a valid http(s) URL, base path included) is required with `link`. The home-server stack sets `link`.
- `POST /cooperatives/{id}/members` returns `{ membershipId, expiresAt, invitationUrl }` and `POST …/members/{memberId}/invitation` returns `200 { expiresAt, invitationUrl }` (it was `204`). `invitationUrl` is absent with the console adapter. Contracts live in `packages/contracts`.
- Token semantics do not change: 7 days (BR-ACC-10), single use, only the hash is stored, a resend replaces the hash so the previous link stops working. The audit events do not change either.
- With `console` in production the API still answers 503 instead of logging tokens.
- The web URL is used rather than the `multicooperativa://` deep link: it works in any browser, including the phone's, and the web app is the only deployed client.

## Consequences

**Positive**

- The whole invitation flow works on the hosted demo with no external service, account or card.
- No change to the domain or to the persistence of invitations; the delivery channel is still a port, so an email adapter can be added later without touching the use cases.

**Security**

- The link is returned only in the response to the invite and resend routes, which already require "Users and profiles · manage": it is visible only to the administrator who could already grant that access. No list, detail or audit endpoint returns it; it is shown once in the app and not stored on the device.
- It stays limited by expiry (7 days), single use and invalidation on resend. Whoever holds the link before it is used can activate the account, so the administrator must send it through a channel they trust; this is weaker than an email to a verified inbox and is accepted for the demo.
- It is served over HTTPS only (Cloudflare Tunnel and GitHub Pages) and the token is never written to logs, as NFR-ACC-08 requires.

**Negative / to watch**

- The administrator, not the platform, is responsible for delivery; there is no proof that the invitee's mailbox exists.
- The app does not validate the invited email beyond its format.

## Future work

Add an email adapter behind the same `InvitationSender` port (`INVITATION_DELIVERY=email`) when a provider is available, keeping the link as a fallback for the administrator.
