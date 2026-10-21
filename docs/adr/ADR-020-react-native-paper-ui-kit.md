# ADR-020: react-native-paper (Material Design 3) as the UI kit

**Date**: 2026-10-21

**Status**: Accepted

## Context

The app's interface was built on a small hand-made kit in `apps/mobile/src/ui/` (button, text field, checkbox, badges, header actions, date field, screen) on top of `StyleSheet.create`, with Ionicons for icons. It works, but every control, its states (pressed, disabled, focused, error), its accessibility props and its look on the web have been written and maintained by hand, and the screens still carry a lot of ad-hoc styling. The app is a thesis deliverable that has to look like a finished product on iOS, Android and the web build, and the cooperative's colour ([ADR-018](ADR-018-per-cooperative-branding.md)) has to reach every control.

The constraints are the ones of the project: no new dependency without a recorded reason (`CLAUDE.md`), the Expo SDK of the app (`expo install` compatible), the web build through `react-native-web` ([ADR-001](ADR-001-hybrid-app-with-expo.md), [ADR-012](ADR-012-home-server-with-cloudflare-tunnel.md)), accessibility of the existing controls kept, and the feature freeze of 22/10/2026 close.

## Options Considered

1. **Keep the hand-made kit with `StyleSheet`.** No dependency and full control, but every missing control (dialogs, chips, menus, text-field adornments, ripple, focus states) has to be written, and the look stays inconsistent between screens.
2. **react-native-paper (Material Design 3).** Complete, maintained, themeable component set with a first-class theme object (colour roles derived from one seed), accessibility props, ripple, and web support through `react-native-web`. It only needs `react-native-safe-area-context` (already installed by Expo Router) and an icon set (`@expo/vector-icons`, already a dependency). It adds a Material look, not a native iOS one.
3. **Tamagui, gluestack-ui or Nativewind.** Tamagui and gluestack bring their own compiler or provider conventions and a larger learning and configuration cost; Nativewind is a styling approach rather than a kit and `CLAUDE.md` already excludes it without an ADR. None of them gives the brand-colour theming for free.

## Decision

Option 2.

- **Library.** `react-native-paper` (v5, Material Design 3), installed with `expo install`. It is the only new dependency: icons use `@expo/vector-icons`, already in the app.
- **Theme injected from the brand colour.** `createPaperTheme(brandColor)` in `src/ui/theme.ts` builds an MD3 light theme: the brand is `primary`, with `onPrimary` white (the colour already passes the 4.5:1 rule of BR-ACC-16), and the containers and the secondary roles are derived from it. Danger stays the fixed red as `error`, so a red brand never makes an error look like a normal action (ADR-018). The root layout mounts a `PaperProvider` with the default green for the sign-in screens, and `BrandPaperProvider` (inside the `BrandProvider`, in the cooperative layout) re-themes with `useBrandColor()` once the cooperative is known.
- **Icons.** `MaterialCommunityIcons` from `@expo/vector-icons` (Paper's default set) replaces Ionicons everywhere; Paper's own icons are routed to it through the provider's `settings.icon`.
- **Kit.** `src/ui/` keeps its components and their props but renders Paper components (`Button`, outlined `TextInput` with `HelperText`, `Checkbox.Item`, `Badge`, `IconButton`, `ActivityIndicator`). New screens use Paper components directly and read colours with `useTheme()`; `StyleSheet.create` stays for layout. Screens are migrated feature by feature.
- **Web.** The same components run through `react-native-web`; the date field keeps its native and browser controls and only restyles the surrounding input.
- **Out of scope.** Dark mode (the theme is light only; a second theme would need its own contrast rules, as ADR-018 notes) and replacing the system pickers and `Alert`-based confirmations.

## Consequences

**Positive**

- One consistent look and set of states across screens and platforms; less hand-written UI code to maintain and test.
- The cooperative's colour reaches every Paper control through the theme, with no per-component overrides.
- Standard accessibility roles and states on the controls, and the touch targets of Material.

**Negative / to watch**

- A Material look on iOS instead of the native one.
- A new runtime dependency and a larger web bundle.
- During the migration two styles coexist: screens not yet migrated still use `colors` from `src/ui/theme.ts` and the hand-made styles.
- Paper's `Badge` and `IconButton` have fixed internal metrics; the kit adjusts them with style overrides.

## Relation to other ADRs

- Builds on [ADR-018](ADR-018-per-cooperative-branding.md): the brand colour is the seed of the theme; danger, warning and neutral colours stay fixed.
- Keeps the web build of [ADR-001](ADR-001-hybrid-app-with-expo.md) and [ADR-012](ADR-012-home-server-with-cloudflare-tunnel.md) working through `react-native-web`.
- Supersedes nothing: the "injected theme" rule of [02-stack-and-architecture.md](02-stack-and-architecture.md) is implemented with Paper's theme.
