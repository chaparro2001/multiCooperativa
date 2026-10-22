# Banner

A full-width strip (`radius-md`, `space-3`/`space-4` padding) for a state of the whole screen or list, with an optional text action.

- `warning`: `warning-container` + `warning` icon + `text` copy — the amber banners of the invoice list, "Revisa los datos leídos…".
- `danger`: inline connection or permission errors that do not replace the content.
- `info`: neutral facts in brand tint ("Fecha cambiada el …", "Es tu propio acceso: no puedes modificarlo desde aquí.").
- Banners go above the list, under the summary cards. Never stack more than two; merge or drop the least urgent.
- AI and privacy messages use `AiNotice`, not a banner.

The consumer provides: `tone`, `children`, optional `action` (a text `Button`), optional `icon`.
