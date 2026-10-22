# AiNotice

The one recognisable style for every AI-related notice: privacy, "AI is only a proposal", model information.

- `surface-variant` fill with a 1 px dashed `muted` border, `radius-sm`, an uppercase `secondary` kicker ("PRIVACIDAD", "PROPUESTA DE LA IA", "ASISTENTE IA") and a leading icon: `shield-lock-outline` (privacy), `creation` (proposal), `information-outline` (info).
- The dashed edge is unique to AI notices — no other component uses it — so users learn "this is about the AI".
- Places: capture screen (privacy), register form (proposal: "Revisa los datos leídos…" goes in a warning `Banner`; the note that nothing is saved without confirmation goes here), discrepancy cards, assistant settings (provider privacy and fallback).
- Copy stays the brief's Spanish text; never add reassurance the product does not guarantee.

The consumer provides: `kind`, `children`, optional `title`.
