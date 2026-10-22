# ProgressBar

A labelled 8-high bar for participation: "Participación: 42 de 120 (35 %)".

- Track `surface-variant` with a `border` ring, fill `primary`. The numbers are always written beside the label; the bar only illustrates.
- An optional 2 px `text` mark shows the quorum threshold; the quorum outcome is still written below ("Con quórum en primera convocatoria").

The consumer provides: `label`, `value`, `total`, optional `quorum` (percent).
