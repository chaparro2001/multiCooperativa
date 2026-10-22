# Chip

Choices among a short set: categories, profiles, roles, filters, linked delivery notes, suggested third parties.

- Outlined (`muted` border, `radius-sm`, 32 high with a 48 hit area). Selected = `primary` fill, `on-primary` text and a check icon, so selection is never colour alone.
- Single choice (Categoría, Perfil, movement type) uses a `Chips` group with `single`; multiple choice (Proveedor / Cliente roles, "Albaranes pendientes que agrupa") allows several selected.
- When a required chip group is invalid wrap it in `FieldGroup` with its error ("Marca al menos un rol: proveedor, cliente o ambos.").
- For 2–3 mutually exclusive views use `SegmentedButtons` instead.

The consumer provides: `children` (label), `selected`, `onPress`, optional `icon`.
