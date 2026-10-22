# UI kit reference (`src/ui`)

Compose screens from these; do not import `react-native-paper` in screens (ADR-020) and do not hand-roll what is listed here (ADR-024). Colours come from `useTheme()` (brand through the theme, `useBrandColor()` for the raw brand), tokens from `@/ui/theme`. Visual reference: `docs/design-system/` (component READMEs, `screens.md`). Amounts are exact decimal strings, never numbers.

## Tokens (`@/ui/theme`)

`space[1..12]` (4-pt scale; `space[6]` is the screen padding), `radius` (`xs sm md bubble lg full`), `size` (`control` 48, `field`, `iconTile`, `iconEmpty`, `badge`, `countBadge`, `composerMax`…), `shadow[1..3]` (`boxShadow` strings), `layout.maxWidth`, `scrim`, `colors` (fixed: `danger`, `dangerContainer`, `warning`, `warningContainer`, `text`, `muted`, `border`, `surfaceVariant`), `focusRing(color)` (web only: apply with `Platform.OS === 'web'`).

## Layout and structure

- `Screen`, `Loading`, `ErrorText`, `SCREEN_PADDING` (`@/ui/screen`): `<Screen form={form} footer={<ActionBar>…</ActionBar>}>`. `footer` stays outside the scroll view.
- `ActionBar` (`@/ui/action-bar`): `children`. Sticky bottom bar for long forms; put `FormSummary` and the block `Button` inside.
- `Card` (`@/ui/card`): `onPress?`, `selected?`, `style?`, `testID`, `accessibilityLabel`. Outlined hairline card; 2 px brand border when `selected`.
- `SectionTitle` (`@/ui/section-title`): `children`, `small?`. Heading with 20 above.

## Rows, tiles, cards

- `ListRow` (`@/ui/list-row`, memoized): `title`, `meta?`, `unread?`, `amount?` (string), `status?` (one `Badge`), `badges?`, `alert?: { tone?: 'danger' | 'warning'; text; icon? }`, `onPress`, `testID`. `testID` lands on the pressable card.
- `HomeTile` (`@/ui/home-tile`): `icon`, `title`, `count?`, `countLabel?`, `onPress`, `style?` (set column width), `testID`, `countTestID`. Square.
- `AttentionItem` (`@/ui/attention-item`): `icon`, `title`, `meta?`, `badge?`, `onPress`, `testID`. Home "Pendiente para ti" row.
- `HeroCard` (`@/ui/hero-card`): `label`, `amount`, `meta?`, `testID`, `amountTestID`. One per screen.
- `SummaryCard` (`@/ui/summary-card`): `label`, `amount`, `meta?`, `overdue?`, `testID`, `amountTestID`, `style?`.
- `MapCard` (`@/ui/map-card`): `place`, `testID`. Place text and "Cómo llegar" (opens the native maps search through `Linking`; helper `mapsSearchUrl` in `@/ui/maps-url`). Render only when the assembly has a place.

## Status and feedback

- `Badge` (`@/ui/badge`): `label`, `tone?: 'neutral' | 'info' | 'warning' | 'danger'`, `quiet?`, `icon?`, `testID`. One filled badge per row; the rest `quiet`.
- `CountBadge` (`@/ui/count-badge`): `count`, `testID`. Absolute top-right of a tile; hidden at 0, "99+" above 99.
- `Banner` (`@/ui/banner`): `tone?: 'warning' | 'danger' | 'info'`, `icon?`, `action?` (a `Button variant="text"`), `children`. Max two per screen.
- `AiNotice` (`@/ui/ai-notice`): `kind?: 'privacy' | 'proposal' | 'info'`, `title?`, `children`. Every AI-related notice.
- `Money` (`@/ui/money`): `amount` (string), `signed?`, `variant?`, `color?`, `style?`, `testID`. Tabular figures, true minus, red when negative. Pure formatter: `formatMoney` in `@/ui/money-format`.
- `ProgressBar` (`@/ui/progress-bar`): `label` (write the numbers in it), `value`, `total`, `mark?` (0..1, e.g. quorum threshold), `testID`.
- `VoteOption` (`@/ui/vote-option`): `label`, `selected`, `disabled?`, `onPress`, `testID` (`option-<value>`).
- `VoteTally` (`@/ui/vote-tally`): `favor`, `against`, `abstentions`, `testID`. Render only when the API sends `tally`.

## States (`@/ui/states`)

- `EmptyState`: `message`, `icon?` (the module's icon), `title?`, `action?`, `testID`.
- `ErrorState`: `message`, `icon?`, `onRetry?` (omit or `false` for permission errors, with `icon="lock-outline"`), `testID`. Message has `testID="error-message"`; retry button `retry-button`.
- `Skeleton`: `variant?: 'list' | 'detail'`, `rows?`. First-load placeholder; shimmer off under reduced motion; no testID on purpose (Maestro waits for the real screen ids).
- `ListFooter`: `loading`. Spinner at the end of an infinite list.

## Forms and controls

- `Button` (`@/ui/button`): `title`, `onPress`, `variant?: 'primary' | 'secondary' | 'danger' | 'text'`, `icon?`, `block?`, `loading?`, `disabled?`, `color?`, `testID`.
- `TextField`, `FieldError`, `FieldGroup`, `FormSummary` (`@/ui/text-field`, `@/ui/field`): `FieldGroup` takes `label?`, `name?`, `error?`; `FormSummary` takes `form` and optional `children` (server error text replaces the generic copy).
- `SwitchRow` (`@/ui/switch-row`): `label`, `help?`, `value`, `onValueChange`, `disabled?`, `testID` (on the whole row).
- `Chip` (`@/ui/chip`): `label` or children, `selected`, `onPress`, `testID`. Outlined; brand fill with check when selected.
- `Segmented` (`@/ui/chip`): `value`, `onChange`, `options`, `testIDPrefix`, `name?`, `error?`. `SegmentedButtons`: Paper props, check on the selected one.
- `Checkbox`, `DateField`, `HeaderAction`, `AppLogo`: unchanged.
- `Icon`, `Text`, `IconButton`, `useTheme`, `Divider`… (`@/ui/paper`): Paper re-exports. The old Paper `Card` is still there for screens not migrated yet; use the kit `Card`.

## Assistant (`@/features/assistant/components`)

`ChatBubble` (`role`, `pending?`, `children`), `Thinking`, `SourceCard` (`title`, `excerpt?`, `n?`, `icon?`, `onPress?`, `excerptLines?`, `highlight?`, `accessibilityLabel?`), `Composer` (`value`, `onChangeText`, `onSend`, `disabled?` — read-only while a reply is pending, `maxLength?`, `sendTestID?`).

## Conventions

- Copy goes through i18n (`ui.*` keys for kit strings: `ui.aiNotice.*`, `ui.tally.*`, `ui.map.directions`, `ui.loading`; retry is `common.actions.retry`).
- Keep each screen's Maestro `testID` on the pressable element, not on a wrapper.
- Lists: memoized items, stable callbacks, no inline functions or styles in `renderItem`.
