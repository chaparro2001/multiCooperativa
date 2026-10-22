multiCooperativa connects each cooperative with its members — announcements, general assemblies with advisory voting, documents, share capital — and gives the cooperative control of invoices and delivery notes. It is generic: agricultural, housing, worker or consumer cooperatives all use it. Build every screen so a non-technical, possibly older member finds the primary action at once.

The stack is fixed: **React Native Paper v5 (Material Design 3)**, MaterialCommunityIcons, the system font, light theme, portrait. These tokens map one-to-one onto `apps/mobile/src/ui/theme.ts`; the components here are reference renderings of the Paper components restyled, not a replacement for them.

## Content fundamentals

- **All UI copy is Spanish and used verbatim** as the brief quotes it (ADR-008). Do not translate, shorten or "improve" it: "Emitir voto", "Revisa los campos marcados en rojo.", "Todavía no hay comunicados.".
- Address the user as **tú**, plainly: "¿En qué cooperativa quieres trabajar?", "Tu voto: A favor", "Revisarás los datos leídos antes de guardar nada."
- Sentence case everywhere — titles, buttons, badges. No exclamation marks, no emoji, no jargon ("Conciliada" is the one accounting word members never see).
- Buttons are verbs: "Entrar", "Publicar", "Marcar como pagada". A destructive verb is honest about permanence in its confirmation: "El voto no se puede cambiar.", "no se puede deshacer".
- Dates: "22 oct 2026" and "22 oct 2026, 18:30". Money: `1.234,56 €`, refunds `−350,00 €` in `danger`. Counts are written with the noun: "3 comunicados sin leer", "N votaciones abiertas".
- Meta lines join facts with " · ": "22 oct 2026 · Autor · 2 adjuntos".
- AI copy never overclaims: the AI "propone", the person confirms. Keep "El detalle numérico es el que manda; la explicación es orientativa." wherever explanations appear.
- Demo data for mockups: **Cooperativa Agrícola San Isidro**, **Cooperativa Olivarera La Esperanza**, *Lucía Martín* (member of both, a different profile in each).

## Visual foundations

**Tone:** trustworthy, calm, institutional but friendly. White pages, one brand colour used with restraint, hairline borders instead of heavy shadows, generous type. Nothing sector-specific — no olives, wheat, houses or tools.

### Colour

- **One brand colour per cooperative.** Every brand-derived token (`primary`, `primary-container`, `on-primary-container`, `secondary`, `elevation-1…5`) has a value for each of the 8 presets, which are this system's themes. A custom `#RRGGBB` follows the same rules: containers = brand mixed with white, deep tones = brand mixed with black, `secondary` = brand mixed 50 % with `muted`. Express any new tone (a tinted header, a hero background) the same way.
- `primary` is for action and identity: filled buttons, selected controls, header icons, tile icons, the unread dot, user chat bubbles, the capital hero. Do not use it for large decorative fields.
- `primary-container` fills home tiles, info badges and selected vote cards; text on it is `on-primary-container` (≥ 11:1 in every preset). `primary` on `primary-container` is only for icons and 24 px+ text — it drops to 4.08:1 in amber.
- Page and cards are `background` / `surface` (white). `surface-variant` (`#f4f6f5`) is for assistant bubbles, neutral badges, skeletons and AI notices.
- Text is `text` (`#1b1b1b`); secondary text `muted` (`#5f6368`, ≥ 5.6:1 on white and `surface-variant`). `border` is decorative only.
- **Fixed semantics** never follow the brand: `danger` / `danger-container`, `warning` / `warning-container`. Status = word + tone, never tone alone (in the slate preset `info` and `neutral` badges are close in colour; the word and the neutral badge's ring tell them apart).
- White on every preset's `primary` is ≥ 5.0:1 (amber is the weakest); the server enforces 4.5:1 for custom colours.

### Type

System font (San Francisco / Roboto / Segoe), MD3 scale. Body copy is `bodyLarge` (16/24) — one step larger than Paper's default, for legibility. Header titles `titleLarge`; row and section titles `titleMedium`; meta, help and errors `bodyMedium`; fine print `bodySmall` (never below 12); buttons and chips `labelLarge`; badges `labelMedium`. Figures in amounts use tabular numbers; the capital hero uses `displaySmall`.

### Space, shape, elevation

- 4-pt spacing scale: screen padding `space-6` (24), block gap `space-4` (16), list padding `space-4`, row gap and home-grid gap `space-3` (12).
- Radii: inputs `radius-xs` (4), chips, source cards and AI notices `radius-sm` (8), cards, tiles and vote options `radius-md` (12), chat bubbles `radius-bubble` (14), hero and summary cards `radius-lg` (16), buttons and badges `radius-full`.
- Elevation is tonal first: pressed and scrolled surfaces take `elevation-1…5`. Shadows (`shadow-1…3`) are faint and reserved for pressed cards, the sticky `ActionBar`, menus. Cards at rest: 1 px `border`, no shadow — this keeps iOS from feeling like an Android port.
- Touch targets: buttons and rows ≥ `size-control` (48); header icons `size-header-icon` (44×44).

### Layout

Portrait only. Design at `layout-phone` (390); the web build centres content at `layout-max-width` (960). Home grid: 2 / 3 / 4 columns at < 600 / ≥ 600 / ≥ 840. Single stack navigation from the home grid; every other screen has a header with the back arrow, title and up to two `HeaderAction`s.

### States

- **Pressed:** `elevation-1` (white surfaces) or `elevation-5` (tinted tiles) plus `shadow-1`; outlined controls take `elevation-2`.
- **Focus (web):** solid 2 px `focus-ring` (= `primary`), offset 2 px — ≥ 3:1 on white in every preset.
- **Disabled:** `disabled-container` fill and `disabled-text` (38 %).
- **Error:** 2 px `danger` border, message under the field, announced; `FormSummary` above the submit button.
- **Loading:** `Skeleton` rows for lists and details; spinner only in list footers and buttons.
- **Motion:** short and functional — shimmer on skeletons, switch thumb travel. Respect reduced motion.

## Shared patterns

- **Lists** (one pattern for every module): search field with debounce → `SegmentedButtons` or `Chips` → `Banner`s (max two) → `ListRow` cards, newest first, pull to refresh, infinite scroll with `ListFooter`, `Skeleton` on first load, `EmptyState` with the module icon when empty, `ErrorState` with "Reintentar" on failure.
- **Detail screens:** status badges first, then the title in `headlineSmall`, meta in `bodyMedium` `muted`, body in `bodyLarge`, attachments as `Card`s, manage-only controls grouped at the end under a divider. Manage permission adds controls to the same screen; it never gets its own screen.
- **Forms:** validate on submit, scroll to and focus the first invalid field, error under each field, `FormSummary` next to the button, counters "(n/120)" in labels. Forms longer than one screen are split into titled sections (document · amounts · lines · delivery notes) with a sticky `ActionBar`.
- **Status:** one filled `Badge` per list row, the most urgent; secondary states as quiet badges or only in the detail. Same word, same tone everywhere.
- **AI notices:** always `AiNotice` — dashed border, uppercase kicker, `shield-lock-outline` / `creation` / `information-outline`. Low-confidence fields read by the AI carry ⚠ (`alert-outline` in `warning`) inside the field plus a warning `Banner` "Revisa los datos leídos…".
- **Confirmations** are native dialogs; design only their text.
- **Permissions:** a module the profile cannot read does not appear — no locked tiles, no disabled entries.
- **Home attention strip (proposal):** up to three `AttentionItem`s above the grid ("Pendiente para ti"): open votes, next assembly, unread announcements, overdue invoices. Hidden when empty.

## Iconography

MaterialCommunityIcons only — the `assets/Icons` group holds the official `@mdi/svg` 7.4.47 files for the 62 glyphs this system uses, and `Icon` renders the same paths. Prefer `-outline` variants. Sizes: 24 default, 40 home tiles, 48 empty/error states, 18 inside chips and buttons, 14 in badges. Icons inherit `currentColor`: `primary` for actions and tiles, `secondary` for supporting icons, `muted` for chevrons. Every icon-only control has a Spanish label. No emoji.

Home tiles, in order: Comunicados `bullhorn-outline` · Asambleas `hand-back-left-outline` · Documentos `file-document-outline` · Facturas `receipt-text-outline` · Albaranes `package-variant-closed` · Proveedores `office-building-outline` · Clientes `store-outline` · Área del socio `account-outline` · Asistente `chat-processing-outline` · Miembros `account-group-outline`.

## Logo

There is no app logo in this system yet: `AppLogo` shows a placeholder mark (the `account-group-outline` glyph on `primary`) beside the wordmark "multiCooperativa" set in the system font. Replace it with the official file when supplied. Cooperatives have no logo (ADR-021) — their identity is their colour and name only.

## Out of scope

Dark theme, landscape, push-notification prompts, offline mode, password change or reset ("forgot password" does not exist — do not add it), custom profile editor, audit log, proxy or secret voting.
