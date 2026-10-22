# CountBadge

The red count bubble on the top-right corner of a home tile (Comunicados: unread; Facturas: needing attention; Albaranes: needing billing).

- `danger` fill, `on-danger` number in `labelSmall` bold, 20 minimum, a 2 px `surface` ring to lift it off the tile. Above 99 it reads "99+".
- It is hidden from screen readers; the tile's accessible label carries the count in words ("Comunicados, 3 comunicados sin leer").
- Zero renders nothing.

The consumer provides: `count`.
