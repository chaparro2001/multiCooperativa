# ADR-024: Adopt the design system

**Date**: 2026-10-22

**Status**: Accepted

## Context

The design system in [design-system/](../design-system/README.md) was generated from the UI brief ([05-ui-design-brief.md](../05-ui-design-brief.md)): tokens for eight brand presets, about 40 components and 14 reference screens. [06-design-system-migration.md](../06-design-system-migration.md) compares it with the app: the Material Design 3 theme of [ADR-020](ADR-020-react-native-paper-ui-kit.md) already matches the colour and type tokens, and the gap is the missing spacing, radius, shadow and size scales, about 20 components that screens draw by hand, and six items that need new behaviour or navigation.

## Decision

1. **`docs/design-system/` is the visual reference of the app.** Screens follow `README.md` and `screens.md`; `components/<Name>/preview.html` is a reference, never code to copy (it is React web).
2. **Tokens map onto `apps/mobile/src/ui/theme.ts`.** `createPaperTheme(brand)` and its `mix()` derivation stay the authority for brand-derived colours (they also serve custom `#RRGGBB` brands); `tokens.json` documents the result, with its nine rounded values corrected to match `mix()`. Spacing, radius, size, shadow and layout are plain exported constants (`space`, `radius`, `size`, `shadow`, `layout`) outside the Paper theme, plus `backdrop`/`scrim` and a web `focusRing` helper.
3. **The kit in `src/ui` grows with the design's components** (card, list row, home tile, attention item, banner, AI notice, money, progress bar, vote option and tally, map card, states, action bar and others). Screens compose kit components and never import `react-native-paper` directly ([ADR-020](ADR-020-react-native-paper-ui-kit.md)).
4. **The behaviour items of §5 of the migration document are adopted**, not deferred:
   - Home "Pendiente para ti" strip (`AttentionItem`), built client-side from existing endpoints, no API change.
   - `MapCard` as a card with a map-marker icon, the place text and a "Cómo llegar" text button that opens the platform's native maps search through `Linking`. No map library, no geocoding, no coordinates: the free-text `place` is the query.
   - Cooperative colour dot in the cooperative selector.
   - Admin Settings split into sub-pages (Apariencia, Facturación, Asistente IA).
   - Quorum mark on the participation bar.
   - Sticky `ActionBar` in the invoice register form (a `footer` slot in `Screen`, outside the `ScrollView`).
     Each one that needs data the API does not expose today is handled in its own task of the plan; a contract or API change goes with its own specification update.
5. **Copy is kept** where the app already has the brief's string; Maestro selectors (`testID`s and asserted texts) are part of the contract and do not change.

This extends [ADR-018](ADR-018-per-cooperative-branding.md) and [ADR-020](ADR-020-react-native-paper-ui-kit.md) without changing them.

## Options Considered

1. **Keep the current look.** No risk, but the app would not match the delivered design and about 20 patterns stay hand-rolled in the screens.
2. **Adopt only the visual part and cut the behaviour items.** Lower risk close to the delivery, but the design would be only partly implemented.
3. **Adopt everything** (chosen), building the whole kit first and migrating the screens on top of it.

## Consequences

**Positive**

- One place (`src/ui`) knows the look; screens shrink to composition and stay consistent across the three presets and the web build.
- Spacing, radii, shadows and sizes become named constants instead of literals.

**Negative / to watch**

- A large visual change close to the delivery (26/10/2026): every screen is touched, so the Maestro journeys and the manual checks on Expo web are re-run after the screens migrate.
- "Cómo llegar" depends on the platform's maps app and on `place` being a searchable text; there is no map inside the app.
- The behaviour items that need data (colour per cooperative, quorum threshold) add fields to contracts and the API.

**Dependencies**: none. Shimmer uses React Native `Animated` and `AccessibilityInfo`; shadows use the `boxShadow` style; icons stay `MaterialCommunityIcons`; maps open through `Linking`.

## Relation to other ADRs

- Extends [ADR-018](ADR-018-per-cooperative-branding.md) (brand colour reaches the new components through the theme and `useBrandColor()`) and [ADR-020](ADR-020-react-native-paper-ui-kit.md) (Paper stays the base of the kit).
