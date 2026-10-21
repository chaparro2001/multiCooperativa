import type { AssistantConversation } from '@multicooperativa/contracts';
import { router } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { useConversationList, useDeleteConversation } from '@/features/assistant/queries';
import { formatDateTime } from '@/i18n/format';
import { Button } from '@/ui/button';
import { confirmAction } from '@/ui/confirm';
import { Card, IconButton, Text, useTheme } from '@/ui/paper';
import { ErrorText, Loading } from '@/ui/screen';
import { usePullToRefresh } from '@/ui/use-pull-to-refresh';

/** US-AI-04: my conversations, newest first; tap to reopen, delete with confirmation. */
export default function AssistantHistoryScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
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

  function openConversation(id: string) {
    router.dismissTo({ pathname: '/assistant', params: { conversation: id } });
  }

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
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.top}>
        <Button
          title={t('assistant.history.new')}
          onPress={() =>
            router.dismissTo({ pathname: '/assistant', params: { fresh: String(Date.now()) } })
          }
          testID="history-new"
        />
        <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
          {t('assistant.history.privacy')}
        </Text>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </View>
      <FlatList
        testID="conversation-list"
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={items.length === 0 ? styles.center : styles.list}
        ListEmptyComponent={
          <Text variant="bodyLarge" style={[styles.empty, { color: colors.onSurfaceVariant }]}>
            {t('assistant.history.empty')}
          </Text>
        }
        renderItem={({ item }) => (
          <ConversationRow
            item={item}
            onOpen={openConversation}
            onDelete={confirmDelete}
            deleteLabel={t('assistant.history.delete')}
          />
        )}
        onEndReachedThreshold={0.4}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </View>
  );
}

const ConversationRow = memo(function ConversationRow({
  item,
  onOpen,
  onDelete,
  deleteLabel,
}: {
  item: AssistantConversation;
  onOpen(id: string): void;
  onDelete(item: AssistantConversation): void;
  deleteLabel: string;
}) {
  const { colors } = useTheme();
  const right = useCallback(
    () => (
      <IconButton
        icon="delete-outline"
        iconColor={colors.error}
        accessibilityLabel={deleteLabel}
        onPress={() => onDelete(item)}
        testID={`delete-${item.title}`}
      />
    ),
    [colors.error, deleteLabel, item, onDelete],
  );
  return (
    <Card
      mode="contained"
      accessibilityRole="button"
      accessibilityLabel={item.title ?? ''}
      onPress={() => onOpen(item.id)}
      style={{ backgroundColor: colors.surfaceVariant }}
      testID={`conversation-${item.title}`}
    >
      <Card.Title
        title={item.title}
        titleNumberOfLines={2}
        subtitle={formatDateTime(item.updatedAt)}
        right={right}
      />
    </Card>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { padding: 16, gap: 8, width: '100%', maxWidth: 720, alignSelf: 'center' },
  list: { padding: 16, paddingTop: 0, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  empty: { textAlign: 'center' },
});
