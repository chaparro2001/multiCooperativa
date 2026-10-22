# DateField / DayField

A read-only outlined field that opens the native date (DayField) or date-time (DateField) picker; the trailing icon is `calendar-outline` or `calendar-edit-outline`.

- Value in Spanish format: "22 oct 2026" or "22 oct 2026, 18:30".
- Optional fields (Segunda convocatoria) start as a secondary "Añadir" button; once set they show a "Quitar" text button underneath.
- Errors read like every TextField error ("La segunda convocatoria debe ser posterior a la primera.", "La fecha debe ser futura.").

The consumer provides: `label`, `value` (formatted string), `mode` (`datetime` | `day`), `optional`, `error`.
