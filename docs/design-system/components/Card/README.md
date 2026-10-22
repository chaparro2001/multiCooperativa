# Card

The generic container: `surface`, 1 px `border`, `radius-md`, `space-4` padding, no shadow at rest.

- Pressable cards get `elevation-1` + `shadow-1` while pressed.
- Selected cards (current cooperative, chosen vote) get a 2 px `primary` border — the brief's "2 border in brand colour".
- Assembly agenda points, discrepancy cards, attachment cards, version history and invoice lines are Cards.
- On Select cooperative each card may show its own cooperative's colour as a 12 px dot before the name (the rest stays in the current theme).

The consumer provides: `children`, optional `onPress`, `selected`.
