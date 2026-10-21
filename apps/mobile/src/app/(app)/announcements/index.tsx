import type { AnnouncementSummary } from '@multicooperativa/contracts';
import { router, Stack } from 'expo-router';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { useAnnouncementList } from '@/features/announcements/queries';
import { formatDay } from '@/i18n/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card, Text, useTheme } from '@/ui/paper';
import { ErrorText, Loading } from '@/ui/screen';
import { usePullToRefresh } from '@/ui/use-pull-to-refresh';
import { HeaderAction, HeaderActions } from '@/ui/header-action';

/** US-ANN-02: newest first, pinned on top, unread marked; more load at the end. */
export default function AnnouncementListScreen() {
  const { t } = useTranslation();
  const { canManage } = useModuleAccess('announcements');
  const list = useAnnouncementList();
  const { refreshing, onRefresh } = usePullToRefresh(list.refetch);
  const { colors } = useTheme();
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;

  const renderItem = useCallback(
    ({ item }: { item: AnnouncementSummary }) => <AnnouncementRow item={item} />,
    [],
  );
  const keyExtractor = useCallback((item: AnnouncementSummary) => item.id, []);
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (list.isPending) return <Loading />;
  if (list.isError) {
    return (
      <View style={styles.center}>
        <ErrorText>{messageFor(list.error)}</ErrorText>
        <Button title={t('common.actions.retry')} onPress={() => list.refetch()} />
      </View>
    );
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
          <Text variant="bodyLarge" style={{ color: colors.onSurfaceVariant }}>
            {t('announcements.list.empty')}
          </Text>
        }
        renderItem={renderItem}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </>
  );
}

const AnnouncementRow = memo(function AnnouncementRow({ item }: { item: AnnouncementSummary }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const unread = item.status === 'published' && !item.read;
  const open = useCallback(() => router.push(`/announcements/${item.id}`), [item.id]);
  return (
    <Card
      mode="contained"
      accessibilityRole="button"
      accessibilityLabel={
        unread ? t('announcements.list.unreadLabel', { title: item.title }) : item.title
      }
      onPress={open}
      testID={`announcement-${item.title}`}
    >
      <Card.Content style={styles.content}>
        <View style={styles.rowHeader}>
          {unread ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
          <Text
            variant={unread ? 'titleMedium' : 'bodyLarge'}
            style={styles.title}
            numberOfLines={2}
          >
            {item.title || t('common.untitled')}
          </Text>
        </View>
        <View style={styles.meta}>
          {item.pinned ? <Badge label={t('announcements.pinned')} tone="info" /> : null}
          {item.status !== 'published' ? (
            <Badge
              label={t(`enums.announcementStatus.${item.status}`)}
              tone={item.status === 'draft' ? 'warning' : 'danger'}
            />
          ) : null}
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
            {item.publishedAt
              ? formatDay(item.publishedAt)
              : t('announcements.list.createdOn', { date: formatDay(item.createdAt) })}
            {item.authorName ? ` · ${item.authorName}` : ''}
            {item.attachmentCount > 0
              ? ` · ${t('announcements.list.attachmentCount', { count: item.attachmentCount })}`
              : ''}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
});

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  content: { gap: 8 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { flex: 1 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
});
