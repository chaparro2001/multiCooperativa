# Icon

MaterialCommunityIcons only, rendered from the official `@mdi/svg` path data on a 24 grid. This system carries the 62 glyphs the brief and these components use; any other MDI name is allowed in the app.

- Default 24 px (`size-icon`); home tiles 40; empty and error states 48; badges 14; chips and buttons 18.
- Colour comes from the parent (`currentColor`): `primary` for actions and tiles, `secondary` for supporting icons, `muted` for chevrons, `danger` / `warning` for alerts.
- Icon-only controls always have a Spanish `label`; decorative icons are hidden from screen readers.
- Prefer `-outline` variants, matching the navigation map.

The consumer provides: `name`, optional `size`, `label`.
