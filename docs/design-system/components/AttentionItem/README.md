# AttentionItem

**Proposal.** A compact row above the home grid that surfaces what needs the user now, using data the app already has: open votes, next assembly, unread announcements, overdue invoices.

- Under a `SectionTitle` "Pendiente para ti"; at most three items, most urgent first; hidden entirely when nothing is pending.
- Module icon in `primary`, title `titleMedium`, meta `muted`, optional status badge, chevron. Tapping goes straight to the item (the vote, the list filtered to overdue).
- Respects permissions exactly as tiles do.

The consumer provides: `icon`, `title`, `meta`, optional `badge`, `onPress`.
