# Money

Euros in Spanish format with tabular figures: `1.234,56 €`.

- Negative amounts (refunds) are `danger` with a true minus sign: `−350,00 €`. Contributions in a movement list are signed `+500,00 €` in `text`.
- Colour is never the only sign: the minus is always there.
- Large figures (capital, summary cards) use `displaySmall` / `headlineSmall` through `HeroCard` and `SummaryCard`.

The consumer provides: `value` (number), optional `signed`. `formatMoney(n)` is exported for strings.
