# ListRow

The row card every list uses (one list pattern for all modules — known issue 7): white `surface`, `border` hairline, `radius-md`, `space-4` padding, `space-3` gap between rows.

Anatomy, top to bottom:
1. **Head** — optional unread dot (`unread`, 10 px) + title (`titleMedium`, bold when unread) + trailing amount (`Money`) and the **one** status badge.
2. **Badges** — at most one more filled badge for managers (Borrador / Retirado), otherwise quiet badges.
3. **Meta** — `bodyMedium` `muted`, joined with " · " ("22 oct 2026 · Autor · 2 adjuntos").
4. **Alert** — optional due line with icon: "Vencida hace N días" (`danger`), "Vence hoy" / "Vence en N días" (`warning`).

Invoice hierarchy (known issue 1): the payment badge is the status (Pendiente / Vencida / Pagada); the due line repeats urgency in words; reconciliation drops to a quiet badge ("Con discrepancia" with `alert-outline`), and "Conciliada" / "Sin albaranes" are shown only in the detail. So a row never carries three filled badges.

Lists: pull to refresh, infinite scroll with `ListFooter`, newest first (pinned first for announcements), `Skeleton` on first load, `EmptyState` when empty.

The consumer provides: `title`, `meta`, optional `unread`, `amount`, `status`, `badges`, `alert`, `onPress`.
