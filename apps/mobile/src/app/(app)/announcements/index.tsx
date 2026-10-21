import type { AnnouncementSummary } from '@multicooperativa/contracts';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { useBrandColor } from '@/branding/brand';
import { useAnnouncementList } from '@/features/announcements/queries';
import { formatDay } from '@/i18n/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { ErrorText, Loading } from '@/ui/screen';
import { usePullToRefresh } from '@/ui/use-pull-to-refresh';
import { colors } from '@/ui/theme';
import { HeaderAction, HeaderActions } from '@/ui/header-action';

/** US-ANN-02: newest first, pinned on top, unread marked; more load at the end. */
export default function AnnouncementListScreen() {
  const { t } = useTranslation();
  const { canManage } = useModuleAccess('announcements');
  const list = useAnnouncementList();
  const { refreshing, onRefresh } = usePullToRefresh(list.refetch);

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
                    title={t('announcements.list.new')}
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
        keyExtractor={(item) => item.id}
        contentContainerStyle={items.length === 0 ? styles.center : styles.list}
        ListEmptyComponent={<Text style={styles.empty}>{t('announcements.list.empty')}</Text>}
        renderItem={({ item }) => <AnnouncementRow item={item} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </>
  );
}

function AnnouncementRow({ item }: { item: AnnouncementSummary }) {
  const brand = useBrandColor();
  const { t } = useTranslation();
  const unread = item.status === 'published' && !item.read;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        unread ? t('announcements.list.unreadLabel', { title: item.title }) : item.title
      }
      onPress={() => router.push(`/announcements/${item.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`announcement-${item.title}`}
    >
      <View style={styles.rowHeader}>
        {unread && <View style={[styles.dot, { backgroundColor: brand }]} />}
        <Text style={[styles.title, unread && styles.unread]} numberOfLines={2}>
          {item.title || t('common.untitled')}
        </Text>
      </View>
      <View style={styles.meta}>
        {item.pinned && <Badge label={t('announcements.pinned')} tone="info" />}
        {item.status !== 'published' && (
          <Badge
            label={t(`enums.announcementStatus.${item.status}`)}
            tone={item.status === 'draft' ? 'warning' : 'danger'}
          />
        )}
        <Text style={styles.detail}>
          {item.publishedAt
            ? formatDay(item.publishedAt)
            : t('announcements.list.createdOn', { date: formatDay(item.createdAt) })}
          {item.authorName ? ` · ${item.authorName}` : ''}
          {item.attachmentCount > 0
            ? ` · ${t('announcements.list.attachmentCount', { count: item.attachmentCount })}`
            : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  empty: { color: colors.muted, fontSize: 16 },
  row: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 8 },
  pressed: { opacity: 0.7 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  title: { flex: 1, fontSize: 16, color: colors.text },
  unread: { fontWeight: '700' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  detail: { fontSize: 13, color: colors.muted },
});
