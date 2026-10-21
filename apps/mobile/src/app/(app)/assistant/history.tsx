import type { AssistantConversation } from '@multicooperativa/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { useConversationList, useDeleteConversation } from '@/features/assistant/queries';
import { formatDateTime } from '@/i18n/format';
import { Button } from '@/ui/button';
import { confirmAction } from '@/ui/confirm';
import { ErrorText, Loading } from '@/ui/screen';
import { colors } from '@/ui/theme';
import { usePullToRefresh } from '@/ui/use-pull-to-refresh';

/** US-AI-04: my conversations, newest first; tap to reopen, delete with confirmation. */
export default function AssistantHistoryScreen() {
  const { t } = useTranslation();
  const list = useConversationList();
  const remove = useDeleteConversation();
  const { refreshing, onRefresh } = usePullToRefresh(list.refetch);
  const [error, setError] = useState<string | null>(null);

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

  function confirmDelete(item: AssistantConversation) {
    confirmAction({
      title: t('assistant.history.deleteTitle'),
      message: t('assistant.history.deleteMessage'),
      confirmLabel: t('common.actions.delete'),
      cancelLabel: t('common.actions.cancel'),
      destructive: true,
      onConfirm: () => {
        setError(null);
        remove.mutate(item.id, { onError: (failure) => setError(messageFor(failure)) });
      },
    });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Button
          title={t('assistant.history.new')}
          onPress={() =>
            router.dismissTo({ pathname: '/assistant', params: { fresh: String(Date.now()) } })
          }
          testID="history-new"
        />
        <Text style={styles.privacy}>{t('assistant.history.privacy')}</Text>
        {error && <ErrorText>{error}</ErrorText>}
      </View>
      <FlatList
        testID="conversation-list"
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={items.length === 0 ? styles.center : styles.list}
        ListEmptyComponent={<Text style={styles.empty}>{t('assistant.history.empty')}</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.title ?? ''}
              onPress={() =>
                router.dismissTo({ pathname: '/assistant', params: { conversation: item.id } })
              }
              style={({ pressed }) => [styles.open, pressed && styles.pressed]}
              testID={`conversation-${item.title}`}
            >
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.date}>{formatDateTime(item.updatedAt)}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('assistant.history.delete')}
              onPress={() => confirmDelete(item)}
              style={styles.delete}
              testID={`delete-${item.title}`}
            >
              <Text style={styles.deleteText}>{t('common.actions.delete')}</Text>
            </Pressable>
          </View>
        )}
        onEndReachedThreshold={0.4}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  top: { padding: 16, gap: 8, width: '100%', maxWidth: 720, alignSelf: 'center' },
  privacy: { color: colors.muted, fontSize: 13 },
  list: { padding: 16, paddingTop: 0, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  empty: { color: colors.muted, fontSize: 16, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  open: { flex: 1, padding: 14, gap: 4 },
  pressed: { opacity: 0.7 },
  title: { fontSize: 16, color: colors.text },
  date: { fontSize: 13, color: colors.muted },
  delete: { paddingHorizontal: 14, paddingVertical: 14 },
  deleteText: { color: colors.danger, fontSize: 14 },
});
