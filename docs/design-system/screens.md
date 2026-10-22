# Screens

How each screen in the brief (§7) is assembled from this system. Copy, states and permissions stay as the brief lists them.

## Entry

- **Login** — always the green preset. `AppLogo` centred, subtitle `bodyLarge` `muted`, `TextField` Email + Contraseña (`secure`), block primary "Entrar" (loading spinner), footer note `bodySmall` `muted`. Errors as a danger `Banner` above the button. No header.
- **Invitation** — same frame; title "Activa tu acceso" in `headlineLarge`. Invalid or expired link: `ErrorState` with no retry and the brief's copy. Success: `check-circle-outline` 48 in `primary`, "Acceso activado", one primary CTA.
- **Biometric lock** — full-screen `elevation-5` over `scrim`; `fingerprint` 48, primary "Desbloquear", secondary "Entrar con contraseña".
- **Select cooperative** — greeting in `headlineMedium`, then one `Card` per membership; the current one `selected`; a 12 px dot in each cooperative's own colour before its name.

## Home

`Header` with the cooperative name and `cog-outline`; identity line ("Consejo rector · Socio") in `bodyMedium` `secondary`; optional "Pendiente para ti" `AttentionItem`s; the `HomeTile` grid. Member: 5 tiles; Administrator: 10.

## Modules

- **Comunicados** — `ListRow` with unread dot + bold title, one badge (Fijado; managers also Borrador / Retirado). Detail: badges, `headlineSmall` title, plain selectable body, PDF attachments as `Card`s with `file-pdf-box`. Manage block at the end: "Leído por X de N miembros" as a `ProgressBar`, then the buttons.
- **Asambleas** — the detail shows a `MapCard` under the date/place facts when the assembly has a geocodable address or coordinates; tapping opens the native maps app. Row: type, "date · place", status badge, warning badge "N votaciones abiertas". Detail (known issue 2): one `Card` per agenda point; voting points add a voting block in a fixed order (status/result badges → participation `ProgressBar` → `VoteTally` [managers while open, everyone once closed] → quorum line → "Tu voto: …" or primary "Votar" → manager controls). Members never see a hidden tally slot — the block just ends at participation.
- **Vote** — three `VoteOption`s, block primary "Emitir voto", permanent note.
- **Documentos** — search + `SegmentedButtons` Título | Contenido. Título: `SectionTitle` per category, `ListRow`s. Contenido: results as `SourceCard`s (title · pág., 4-line excerpt, match in bold).
- **Facturas / Albaranes** — `SummaryCard` pair, at most two warning `Banner`s, manager buttons, `SegmentedButtons` Compras | Ventas, invoice `ListRow`s with one status badge + due line + quiet reconciliation (known issue 1).
- **Capture** — intro, three large outlined `Card` choices with 40 icons (`camera-outline`, `image-outline`, `file-pdf-box`), "Rellenar a mano" text button, privacy `AiNotice`. Reading: a determinate-looking progress bar with "Leyendo el documento…" and the step names.
- **Register** — sections Documento · Importes · Líneas · Albaranes, each a `SectionTitle`; low-confidence fields marked ⚠; sticky `ActionBar` with "Confirmar y guardar" (known issue 3).
- **Área del socio** — "Mis datos" card, `HeroCard` "Capital aportado", "Movimientos" rows with signed `Money`.
- **Miembros** — search, filter `Chips`, `ListRow` with profile badge and status; invitation link in an `elevation-3` card with "Copiar enlace" / "Compartir".
- **Asistente** — empty state "¿En qué puedo ayudarte?" with suggestion `Card`s in `primary-container`; thread of `ChatBubble`s, `Sources`, feedback `Chip`s, `Thinking`; `Composer` pinned at the bottom. History: `ListRow`s with a `delete-outline` action.
- **Ajustes** — for everyone a single list; for administrators three sub-pages (Apariencia, Facturación, Asistente IA) reached from `AttentionItem`-style rows. Apariencia: 48 px swatches (`mc-swatch`), hex `TextField`, live contrast line, and a live `HomeTile` + `Button` preview in the chosen colour.

## Known issues, resolved

1. Invoice rows: one filled badge; urgency in words; reconciliation quiet.
2. Assembly detail: one fixed order per voting block, the same for every role.
3. Register form: sections + sticky `ActionBar`.
4. Skeletons replace full-screen spinners.
5. `info` badges use `on-primary-container` text, checked ≥ 11:1 on all presets.
6. AI and privacy notices share the `AiNotice` style.
7. One list pattern (`ListRow`, `Skeleton`, `ListFooter`, `EmptyState`) for every module.
8. Hairlines, tonal elevation and faint shadows keep Material from feeling like an Android port on iOS.
