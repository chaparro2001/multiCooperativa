# ActionBar

A sticky bottom bar for long forms (register invoice/delivery note, assembly editor): `elevation-2` background, `shadow-2`, top corners `radius-lg`, screen-padding sides.

- Holds the `FormSummary` (when invalid) and the primary block button; a secondary button can sit above the primary.
- The scrolling form above it gets `space-12` bottom padding so the last field is never hidden.
- Use only where the form is longer than one screen; short forms keep the button inline at the end.

The consumer provides: `children`.
