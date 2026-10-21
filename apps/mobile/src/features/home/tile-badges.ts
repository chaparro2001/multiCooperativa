import { badgeText } from '@/ui/badge-count';

/** Home tiles that carry a count badge, with the i18n key (plural) of their accessible label. */
export const TILE_BADGE_LABELS = {
  announcements: 'announcements.unreadBadge',
  invoices: 'invoicing.attention.invoices',
  'delivery-notes': 'invoicing.attention.notes',
} as const;

export type BadgeTileId = keyof typeof TILE_BADGE_LABELS;

export type TileBadgeCounts = Partial<Record<BadgeTileId, number>>;

/** The badge of a tile: its count and the accessible label key; null when it has none to show. */
export function tileBadge(
  tileId: string,
  counts: TileBadgeCounts,
): { count: number; labelKey: (typeof TILE_BADGE_LABELS)[BadgeTileId] } | null {
  if (!(tileId in TILE_BADGE_LABELS)) return null;
  const id = tileId as BadgeTileId;
  const count = counts[id] ?? 0;
  return badgeText(count) === null ? null : { count, labelKey: TILE_BADGE_LABELS[id] };
}
