# Badge

A 22-high pill (`size-badge`, `radius-full`, `labelMedium`) that states a status in words. Colour is the tone; the word is the meaning.

| Tone | Fill / text | Used for |
| --- | --- | --- |
| `neutral` | `surface-variant` + `border` ring / `text` | Celebrada, Pagada, Cobrada, Facturado, Sin albaranes, Anulada |
| `info` | `info-container` / `on-primary-container` | Fijado, Convocada, Pendiente, Conciliada, Aprobado, Disponible para el asistente, Proveedor, Cliente |
| `warning` | `warning-container` / `warning` | Borrador, Abierta, N votaciones abiertas, Con discrepancia, Indexando, Vence hoy |
| `danger` | `danger-container` / `danger` | Retirado, Cancelada, Vencida, Rechazado, Sin quórum, Inactivo, Suspendido, Error al indexar |

- Keep the same tone for the same word in list rows and detail headers.
- `info` text is `on-primary-container`, never `primary`: it holds ≥ 11:1 in every preset, so light brands are safe.
- A row shows **one** filled badge — the most urgent. Secondary states use `quiet` (icon + text, no fill) or move to the detail screen. See the invoice row in `ListRow`.
- An optional leading icon (14 px) can reinforce but never replace the word.

The consumer provides: `tone`, `children` (Spanish word), optional `icon`, `quiet`.
