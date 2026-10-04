import type { AnnouncementSummary } from '@multicooperativa/contracts';
import { Link, router, Stack } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { useAnnouncementList } from '@/features/announcements/queries';
import { formatDay } from '@/features/shared/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { ErrorText, Loading } from '@/ui/screen';
import { colors } from '@/ui/theme';

const STATUS_LABEL = { borrador: 'Borrador', retirado: 'Retirado' } as const;

/** HU-COM-02: newest first, pinned on top, unread marked; more load at the end. */
export default function AnnouncementListScreen() {
  const { canManage } = useModuleAccess('comunicados');
  const list = useAnnouncementList();

  if (list.isPending) return <Loading />;
  if (list.isError) {
    return (
      <View style={styles.center}>
        <ErrorText>{messageFor(list.error)}</ErrorText>
        <Button title="Reintentar" onPress={() => list.refetch()} />
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
                <Link href="/comunicados/editor" testID="nuevo-comunicado">
                  <Text style={styles.headerLink}>Nuevo</Text>
                </Link>
              )
            : undefined,
        }}
      />
      <FlatList
        testID="lista-comunicados"
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={items.length === 0 ? styles.center : styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Todavía no hay comunicados.</Text>}
        renderItem={({ item }) => <AnnouncementRow item={item} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} />
        }
      />
    </>
  );
}

function AnnouncementRow({ item }: { item: AnnouncementSummary }) {
  const unread = item.status === 'publicado' && !item.read;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}${unread ? ', no leído' : ''}`}
      onPress={() => router.push(`/comunicados/${item.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`comunicado-${item.title}`}
    >
      <View style={styles.rowHeader}>
        {unread && <View style={styles.dot} />}
        <Text style={[styles.title, unread && styles.unread]} numberOfLines={2}>
          {item.title || 'Sin título'}
        </Text>
      </View>
      <View style={styles.meta}>
        {item.pinned && <Badge label="Fijado" tone="info" />}
        {item.status !== 'publicado' && (
          <Badge
            label={STATUS_LABEL[item.status]}
            tone={item.status === 'borrador' ? 'warning' : 'danger'}
          />
        )}
        <Text style={styles.detail}>
          {item.publishedAt
            ? formatDay(item.publishedAt)
            : `Creado el ${formatDay(item.createdAt)}`}
          {item.authorName ? ` · ${item.authorName}` : ''}
          {item.attachmentCount > 0
            ? ` · ${item.attachmentCount} adjunto${item.attachmentCount > 1 ? 's' : ''}`
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
  headerLink: { color: colors.primary, fontSize: 16 },
  row: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 8 },
  pressed: { opacity: 0.7 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  title: { flex: 1, fontSize: 16, color: colors.text },
  unread: { fontWeight: '700' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  detail: { fontSize: 13, color: colors.muted },
});
