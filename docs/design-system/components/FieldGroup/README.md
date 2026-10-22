# FieldGroup

Labels a group of non-text inputs (chips, pickers, repeated lines) and, when invalid, frames it in a 2 px `danger` outline with the message below.

- Use for Categoría, Perfil, Rol, movement type, majority choice, repeated invoice lines and assembly points.
- The label is `labelLarge` `text`; it turns `danger` with the frame so the error is never colour-only — the message carries the meaning.
- Repeated lines (invoice lines, assembly points) each sit in a `Card`; the group frame surrounds them all.

The consumer provides: `label`, `error`, `children`.
