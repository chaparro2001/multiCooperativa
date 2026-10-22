# HomeTile

A square module tile in the home grid (2 / 3 / 4 columns at < 600 / ≥ 600 / ≥ 840, gap `space-3`).

- `primary-container` fill, `radius-md`, 40 px `primary` icon top-left, title bottom-left in `titleMedium` `on-primary-container`, up to two lines. Pressed: `elevation-5` + `shadow-1`.
- Optional `CountBadge` top-right. The accessible label carries the count in words: "Comunicados, 3 comunicados sin leer".
- Order and icons are fixed by the navigation map. Modules the profile cannot read are absent — never locked or greyed.
- A Member sees 5 tiles; an Administrator sees 10.

The consumer provides: `icon`, `title`, optional `count` and `countLabel`, `onPress`.
