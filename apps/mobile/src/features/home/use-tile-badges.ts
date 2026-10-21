import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useUnreadAnnouncements } from '@/features/announcements/queries';
import { useInvoicingAttention } from '@/features/invoicing/queries';
import { useActiveCooperative } from '@/cooperatives/active-cooperative';
import { canAccess } from '@/navigation/modules';

import type { TileBadgeCounts } from './tile-badges';

/**
 * Counts of the home tiles that have a badge. Each is asked only when the profile has access to
 * the module (the API answers 403 otherwise) and all are refetched every time the home is shown
 * again; opening, registering, settling or voiding invalidates them from their own queries.
 */
export function useTileBadgeCounts(): TileBadgeCounts {
  const { permissions } = useActiveCooperative();
  const list = permissions?.permissions;
  const attention = useInvoicingAttention(canAccess(list, 'invoicing'));
  const unread = useUnreadAnnouncements(canAccess(list, 'announcements'));
  const refetchAttention = attention.refetch;
  const refetchUnread = unread.refetch;
  const attentionOn = attention.isEnabled;
  const unreadOn = unread.isEnabled;

  useFocusEffect(
    useCallback(() => {
      if (attentionOn) void refetchAttention();
      if (unreadOn) void refetchUnread();
    }, [attentionOn, unreadOn, refetchAttention, refetchUnread]),
  );

  return {
    invoices: attention.data?.invoices,
    'delivery-notes': attention.data?.deliveryNotes,
    announcements: unread.data?.unread,
  };
}
