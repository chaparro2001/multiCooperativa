import { useCallback, useState } from 'react';

/**
 * Spinner only for refreshes the user started by pulling. Tying it to the
 * query's background refetches makes iOS leave the RefreshControl stuck when
 * it changes while the screen is hidden (e.g. after marking an item as read).
 */
export function usePullToRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);
  return { refreshing, onRefresh };
}
