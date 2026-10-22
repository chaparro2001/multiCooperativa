# Button

Three roles, one per intent: `primary` for the single thing the screen is for, `secondary` for everything else, `danger` for actions that remove, void or sign out.

- Pill shape (`radius-full`), at least `size-control` (48) high, label in `labelLarge`, verb first and in Spanish exactly as the brief quotes it ("Emitir voto", "Guardar cambios").
- One `primary` per view. In forms the primary sits last, full width (`block`) on phones; `secondary` ("Guardar borrador") sits above or to its left.
- `danger` is a filled `danger` fill with `on-danger`. It always opens a native confirmation (`Alert` / `window.confirm`); design only that text.
- `loading` swaps the icon for a spinner, keeps the label and disables the button — the label never becomes "Cargando…".
- `disabled` uses `disabled-container` / `disabled-text`. Explain why a button is disabled nearby when it is not obvious (the vote screen's "Emitir voto" is disabled until an option is chosen — that is obvious).
- `text` mode is for low-emphasis links in flows ("Rellenar a mano", "Quitar"); it still keeps a 48 hit area.

The consumer provides: `children` (label), `mode`, `onPress`, optional `icon` (MaterialCommunityIcons name), `loading`, `disabled`, `block`.
