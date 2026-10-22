# Loading

Skeletons replace full-screen spinners on first load (known issue 4); the spinner remains for infinite-scroll footers and short in-place waits.

- List screens: 3–6 `Skeleton` row cards matching the real `ListRow` shape. Detail screens: the `detail` variant (title, meta, body lines).
- Blocks are `skeleton` (`surface-variant`) with a slow shimmer to `elevation-1`; the shimmer stops under reduced motion.
- Infinite scroll: `ListFooter` spinner in `primary`. Pull to refresh: the native refresh control tinted `primary`.
- A centred `Loading` spinner is only for screens with no predictable shape (the AI capture "Leyendo el documento…" uses its own progress copy).

The consumer provides: `rows` or `variant`.
