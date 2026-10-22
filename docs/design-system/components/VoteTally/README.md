# VoteTally

Horizontal bars for "A favor · En contra · Abstenciones" with the counts written at the end.

- Bars: `primary` (A favor), `text` (En contra), `muted` at reduced opacity (Abstenciones) — they differ in lightness, and each row is labelled, so it reads without colour.
- **Hidden from non-managers while voting is open**; shown to everyone once closed. A member with the vote open sees only participation and "Tu voto: …" or the "Votar" button.
- Order inside a point's voting block: status + result badges → participation `ProgressBar` → tally → quorum line → your vote / Votar → manager controls ("Abrir votación" / "Cerrar votación").

The consumer provides: `favor`, `contra`, `abst`.
