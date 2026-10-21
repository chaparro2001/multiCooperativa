# ADR-021: Remove the per-cooperative logo

**Date**: 2026-10-22

**Status**: Accepted

## Context

[ADR-018](ADR-018-per-cooperative-branding.md) let each cooperative's administrator customize the app with a primary colour and a logo. The logo (upload in Settings → "Apariencia", BR-ACC-17) is only visible **after sign-in**, on the cooperative home: the screens before it (login, invitation) cannot know which cooperative the user belongs to and show the app's own logo. So the logo reaches the member late and in one place, while the primary colour already gives each cooperative its own look across the app.

On the other side, the logo carries a disproportionate surface for what it gives: a multipart upload endpoint, an image validation in the domain (magic bytes, size, dimensions, explicit SVG refusal because SVG can carry scripts), objects written to and deleted from the file storage, signed URLs with their own one-hour expiry and refetch logic in the app, and an on-device image reduction step. With the feature freeze of 22/10/2026 and the delivery on 26/10/2026, that surface (and its risk of serving user-supplied active content from our own storage) is not worth keeping.

## Options Considered

1. **Keep the logo as it is.** No work, but it keeps the upload surface and the risks above for a marginal visual gain.
2. **Keep it but harden it** (re-encode every upload on the server): needs an image library on the backend, a new dependency and more tests, close to the delivery date.
3. **Remove the logo and keep the primary colour.**

## Decision

Option 3. This **supersedes the logo part of ADR-018**; its colour part (module `branding`, table `CooperativeBranding`, `GET .../branding`, `PUT .../branding/primary-color`, BR-ACC-16 contrast rule, audit of colour changes, `BrandProvider`, Settings → "Apariencia" colour controls) stays in force unchanged.

- **API.** `PUT` and `DELETE /cooperatives/{id}/branding/logo` are removed, with the multer upload, the logo validation in the domain (BR-ACC-17), the storage writes and deletes, the signed URL and the `logo_rejected` error (`svg_not_allowed`, `unsupported_type`, `too_large`, `too_large_dimensions`). `GET .../branding` returns `{ primaryColor | null, updatedAt | null }` (no `logoUrl`). The `branding` module no longer depends on the file storage port. The audit event `cooperative.branding_changed` only carries `{ primaryColor: { from, to } }`; the `{ logo: ... }` variants disappear.
- **Contracts.** `logoUrl` and the logo limit constants are removed from `packages/contracts/src/branding.ts`.
- **Data.** Migration `20261022120000_remove_cooperative_logo` drops the columns `logoKey` and `logoContentType` of `CooperativeBranding`. The API applies migrations on start (`prisma migrate deploy`), so the home server picks it up with `git pull` and `docker compose --env-file .env.server up -d --build`.
- **App.** `BrandLogo`, `logoUrl`, `refreshLogo` and the 45-minute refetch are removed from the brand provider; the cooperative home no longer shows a logo (the cooperative's name stays in the header); the "Logo" block of Settings → "Apariencia" (picker, 512 px PNG reduction, removal) and its texts are removed. The app's own logo (login and invitation screens) is not touched.
- **Dependencies.** None are removed: `expo-image-picker` and `expo-image-manipulator` are still used by the invoice capture (`features/shared/scan-file.ts`) and `expo-document-picker` by the document uploads.
- **Specification.** BR-ACC-17 is marked as removed (superseded by this ADR) and US-ACC-14 now only covers the colour.

## Consequences

**Positive**

- Less attack surface: no image upload endpoint, no user-supplied files served from our storage, no SVG question.
- Less code and fewer tests to maintain before delivery; the brand provider is a plain colour query again.
- Isolation, permissions and the contrast rule of ADR-018 are unchanged.

**Negative / to watch**

- A cooperative cannot show its own logo; its identity in the app is the primary colour and its name.
- **Orphaned objects.** Logos already uploaded stay in the file storage under `cooperatives/{cooperativeId}/branding/`: no deletion job is written, they are never read again. An operator who wants to reclaim the space can delete that prefix by hand (see "Operating it" in [04-deployment.md](../04-deployment.md)). The demo data had no logos seeded.
- Rolling back needs a new migration that re-adds the columns; the dropped values are not recoverable from the database.

## Relation to other ADRs

- Supersedes the logo part of [ADR-018](ADR-018-per-cooperative-branding.md) (not edited beyond its status line, following [ADR-007](ADR-007-claude-for-vision-and-drafting.md) → [ADR-009](ADR-009-gemini-language-and-vision-model.md)); the colour part and [ADR-020](ADR-020-react-native-paper-ui-kit.md) (theme from the brand colour) are unaffected.
- [ADR-005](ADR-005-s3-file-storage.md) is unchanged: the storage keeps serving documents and attachments.
