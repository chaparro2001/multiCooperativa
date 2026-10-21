# ADR-018: Per-cooperative branding (primary colour and logo)

**Date**: 2026-10-21

**Status**: Accepted (the logo part is superseded by [ADR-021](ADR-021-remove-cooperative-logo.md); the colour part stays in force)

## Context

The platform hosts several cooperatives ([ADR-003](ADR-003-multi-cooperative.md)) behind one app. Members identify with their own cooperative, and the cross-cutting rule 3 of [02-stack-and-architecture.md](../02-stack-and-architecture.md) already says that the theme is injected, not hardcoded. The cooperative's administrator should be able to make the app look like their cooperative (a primary colour and a logo) without anybody touching the server.

Two risks need an explicit decision: an arbitrary colour can make white text unreadable, and an uploaded image served from our own storage is a way to host active content (SVG can carry scripts).

## Options Considered

1. **Per-deployment theme** (environment variables or build-time constants): nothing to build, but every cooperative of the server gets the same look, and changing it needs the operator.
2. **A new column on `Cooperative`**: simple, but that table belongs to the access module (rule 4 of `CLAUDE.md`), which would end up owning a presentation concern and its file storage.
3. **A small `branding` module with its own table**, writable by the cooperative's administrator, readable by every member.

## Decision

Option 3.

- **Owner.** A new backend module `branding` (`apps/api/src/modules/branding/`) with its own table `CooperativeBranding` (`cooperativeId` primary key, `primaryColor`, `logoKey`, `logoContentType`, `updatedAt`). No row means "the default theme". Like `AssistantSetting` ([ADR-014](ADR-014-per-cooperative-assistant-model.md)) it keeps only the cooperative id, with no foreign key towards access. Nobody else touches the table; the module depends on access only through its `index.ts` (`requireAccess`, `requirePermission`, `recordAudit`) and on the file storage port ([ADR-005](ADR-005-s3-file-storage.md)).
- **API.** `GET /cooperatives/{id}/branding` (any active member) returns `{ primaryColor | null, logoUrl | null, updatedAt | null }`; `PUT .../branding/primary-color` with `{ primaryColor: "#RRGGBB" | null }`, `PUT .../branding/logo` (multipart, field `file`) and `DELETE .../branding/logo` need the **`users` module at `manage` level**, the same rule as the assistant model setting (no new permission; the profile × module matrix does not change). Other cooperative: 404; without the permission: 403.
- **Colour validation (BR-ACC-16).** `#RRGGBB`, stored in upper case. White text over it must reach the WCAG AA ratio of **4.5:1**, computed in the pure domain from the WCAG 2.x relative luminance: ratio = 1.05 / (L + 0.05). Otherwise `422 insufficient_contrast` with `details: { ratio, minimum }`. Enforcing it on the server (and not only in the app) means no client can save an unreadable colour. The app mirrors the formula only to give live feedback and to check that its preset swatches pass (a unit test).
- **Logo validation (BR-ACC-17).** PNG or JPEG only, recognised by their **magic bytes**, never by file name or declared mime type; at most 1 MB (multer limit, so the rest is not even buffered) and 1024 × 1024 px (read from the PNG IHDR or the JPEG start-of-frame header, no image library). **SVG is refused explicitly** (`svg_not_allowed`) because it can carry scripts, and anything else that is not PNG or JPEG is `unsupported_type`. All rejections are `422 logo_rejected` with `details.reason`.
- **Storage.** `cooperatives/{id}/branding/<uuid>.<png|jpg>` through the existing port. Replacing writes the new object first, saves the row, and then deletes the old object, so a failure never leaves the cooperative without a logo; removing deletes the object. Reads return a **signed URL valid for one hour** (the documents' five minutes would make the logo expire during a normal session); the app asks again when the image fails to load, and refetches it every 45 minutes.
- **Audit.** Every change is recorded as `cooperative.branding_changed` (`{ primaryColor: { from, to } }` or `{ logo: "set" | "replaced" | "removed" }`) through `recordAudit`. A write that changes nothing leaves no event.
- **App.** A `BrandProvider` (TanStack Query on the active cooperative, under the cooperative's query key so switching cooperative drops it) exposes `useBrandColor()` with the cooperative's colour or, without branding, the app's default green. It replaces `colors.primary` where it means "the brand": the primary and secondary button, the info badge, the loading spinner, the header tint (`headerTintColor` of the navigator, so back arrows and header links follow it), text links and header links, selected chips, segmented and vote options, the unread dot, the cooperative card currently selected and the capital total. The navigator waits for the branding request together with the permissions so the default colour does not flash. Danger, warning and neutral colours stay fixed, so a red brand never makes an error look like a normal action. The home shows the logo with the cooperative's name, and a small accent under each tile once the cooperative has its own colour. Settings → "Apariencia" (administrator only; the API enforces it) has the swatches, the hex field with a live button preview and the contrast feedback, the logo picker (the image is reduced to 512 px and saved as PNG on the device, which also keeps transparency) and the removal.

## Consequences

**Positive**

- Each cooperative looks like itself; the operator is not involved.
- Readability and safety are enforced where they cannot be bypassed: contrast and file checks live in the backend domain, with tests of known colour pairs and of every rejection.
- Isolation and permissions are by construction (row keyed by cooperative, routes behind `requireCooperative` and the `users` · `manage` guard); the isolation test walks the new routes automatically.
- Components that use `colors.primary` in a static `StyleSheet` are themed with inline overrides, without rewriting every style.

**Negative / to watch**

- Not every `colors.primary` is routed yet: the assistant screens and the assistant model section of Settings, and the sign-in title (there is no cooperative before signing in), keep the default colour.
- Only one colour: a brand with a light primary colour cannot be used (it fails the contrast rule), by design. A secondary colour or a dark mode would need their own rules.
- The signed logo URL changes on every read, so the image is not cached by URL across refetches.
- Logos are not scanned beyond their headers: a file with a valid PNG or JPEG signature and size but corrupt pixels is stored and simply fails to render. It cannot execute anything, because the file is only ever served as an image with its declared type.

## Relation to other ADRs

- Same pattern as [ADR-014](ADR-014-per-cooperative-assistant-model.md): a per-cooperative setting in its own module table, changed by whoever has `users` · `manage`, audited through the access module.
- Uses the file storage of [ADR-005](ADR-005-s3-file-storage.md) and the isolation of [ADR-003](ADR-003-multi-cooperative.md) unchanged.
- Implements the "injected theme" rule of [02-stack-and-architecture.md](../02-stack-and-architecture.md).
