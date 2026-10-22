import type { AnnouncementSummary } from '@multicooperativa/contracts';
import { router, Stack } from 'expo-router';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';

import { messageFor } from '@/api/api-error';
import { useAnnouncementList } from '@/features/announcements/queries';
import { formatDay } from '@/i18n/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { HeaderAction, HeaderActions } from '@/ui/header-action';
import { ListRow } from '@/ui/list-row';
import { EmptyState, ErrorState, ListFooter, Skeleton } from '@/ui/states';
import { space } from '@/ui/theme';
import { usePullToRefresh } from '@/ui/use-pull-to-refresh';

/** US-ANN-02: newest first, pinned on top, unread marked; more load at the end. */
export default function AnnouncementListScreen() {
  const { t } = useTranslation();
  const { canManage } = useModuleAccess('announcements');
  const list = useAnnouncementList();
  const { refreshing, onRefresh } = usePullToRefresh(list.refetch);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;

  const renderItem = useCallback(
    ({ item }: { item: AnnouncementSummary }) => <AnnouncementRow item={item} />,
    [],
  );
  const keyExtractor = useCallback((item: AnnouncementSummary) => item.id, []);
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (list.isPending) return <Skeleton variant="list" />;
  if (list.isError) {
    return <ErrorState message={messageFor(list.error)} onRetry={() => list.refetch()} />;
  }

  const items = list.data.pages.flatMap((page) => page.items);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: canManage
            ? () => (
                <HeaderActions>
                  <HeaderAction
                    href="/announcements/editor"
                    icon="plus"
                    label={t('announcements.list.new')}
                    testID="new-announcement"
                  />
                </HeaderActions>
              )
            : undefined,
        }}
      />
      <FlatList
        testID="announcement-list"
        data={items}
        keyExtractor={keyExtractor}
        contentContainerStyle={items.length === 0 ? styles.center : styles.list}
        ListEmptyComponent={
          <EmptyState icon="bullhorn-outline" message={t('announcements.list.empty')} />
        }
        renderItem={renderItem}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        ListFooterComponent={<ListFooter loading={list.isFetchingNextPage} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </>
  );
}

const AnnouncementRow = memo(function AnnouncementRow({ item }: { item: AnnouncementSummary }) {
  const { t } = useTranslation();
  const unread = item.status === 'published' && !item.read;
  const open = useCallback(() => router.push(`/announcements/${item.id}`), [item.id]);
  // One badge per row: the manager states first, otherwise "Fijado".
  const status =
    item.status !== 'published' ? (
      <Badge
        label={t(`enums.announcementStatus.${item.status}`)}
        tone={item.status === 'draft' ? 'warning' : 'danger'}
      />
    ) : item.pinned ? (
      <Badge label={t('announcements.pinned')} tone="info" />
    ) : undefined;
  const meta = [
    item.publishedAt
      ? formatDay(item.publishedAt)
      : t('announcements.list.createdOn', { date: formatDay(item.createdAt) }),
    item.authorName,
    item.attachmentCount > 0
      ? t('announcements.list.attachmentCount', { count: item.attachmentCount })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ListRow
      title={item.title || t('common.untitled')}
      meta={meta}
      unread={unread}
      status={status}
      accessibilityLabel={
        unread ? t('announcements.list.unreadLabel', { title: item.title }) : item.title
      }
      onPress={open}
      testID={`announcement-${item.title}`}
    />
  );
});

const styles = StyleSheet.create({
  list: { padding: space[4], gap: space[3] },
  center: { flexGrow: 1, justifyContent: 'center' },
});
