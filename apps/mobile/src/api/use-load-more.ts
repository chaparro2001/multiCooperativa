import { useCallback } from 'react';

/** `onEndReached` of a paginated FlatList: one stable callback that never asks twice at once. */
export function useLoadMore(query: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
}): () => void {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  return useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
}
