# TextField

MD3 outlined input (`size-field` 56 high, `radius-xs`) with a floating label, an optional counter and the error underneath.

- Label in Spanish, bold-free, with the counter appended when there is a limit: "Título (34/120)", "Texto (n/5000)".
- Focus: 2 px `primary` border, label turns `primary`. Error: 2 px `danger` border, label `danger`, and the message under the field in `bodyMedium` `danger` with an alert icon, announced (`role=alert`).
- Input text is `bodyLarge` (16) — never smaller; members may be older.
- Multiline fields (Texto, Descripción) start at least 200 high and grow; the chat composer is a separate component.
- Read-only values (NIF when editing) use `disabled` plus a help line explaining why.
- Use the generic messages verbatim: "Este campo es obligatorio.", "Debe tener al menos {{min}} caracteres.", "Puede tener como máximo {{max}} caracteres.".

The consumer provides: `label`, `value`, `onChange`, and optionally `maxLength`, `multiline`, `secure`, `error`, `help`, `right` (trailing adornment such as "€").
