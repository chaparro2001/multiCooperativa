# SegmentedButtons

Switches between two or three views of the same list, or a single required choice at the top of a form.

- Used for: **Compras | Ventas**, **Título | Contenido**, **Todos | Proveedores | Clientes**, **Factura | Albarán**, **Compra | Venta**.
- Full width, 40 high inside a 48 row, `radius-full` outer shape, selected = `primary` fill + `on-primary` + check icon.
- Place it directly under the search field (lists) or at the very top of the form (register).
- More than three options → `Chips`.

The consumer provides: `buttons` (`{value, label}`), `value`, `onChange`, an accessible `label`.
