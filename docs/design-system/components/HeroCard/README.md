# HeroCard and SummaryCard

**HeroCard** — the "Mi capital" card of the member area: `primary` fill, `on-primary` text, `radius-lg`, `space-5` padding, label "Capital aportado" and the amount in `displaySmall` with tabular figures.

**SummaryCard** — the two cards at the top of the invoice list, side by side: "Pendiente de pagar" and "Pendiente de cobrar". Outlined `surface`, amount in `headlineSmall`, "N facturas" in `muted`, and when overdue a `danger` line "1.250,00 € vencidas (3)".

- Only one HeroCard per screen; it is the screen's figure.
- Not a member: replace the HeroCard with an `EmptyState`-style message "No eres socio de la cooperativa, así que no tienes capital aportado.".

The consumer provides: `label`, `amount`, optional `meta`, and for SummaryCard `overdue`.
