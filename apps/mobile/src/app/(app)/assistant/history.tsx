import type { AssistantConversation } from '@multicooperativa/contracts';
import { router } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, type ListRenderItem, RefreshControl, StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { useConversationList, useDeleteConversation } from '@/features/assistant/queries';
import { formatDateTime } from '@/i18n/format';
import { AiNotice } from '@/ui/ai-notice';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { confirmAction } from '@/ui/confirm';
import { ListRow } from '@/ui/list-row';
import { IconButton, useTheme } from '@/ui/paper';
import { EmptyState, ErrorState, ListFooter, Skeleton } from '@/ui/states';
import { space } from '@/ui/theme';
import { usePullToRefresh } from '@/ui/use-pull-to-refresh';

/** US-AI-04: my conversations, newest first; tap to reopen, delete with confirmation. */
export default function AssistantHistoryScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const list = useConversationList();
  const remove = useDeleteConversation();
  const { refreshing, onRefresh } = usePullToRefresh(list.refetch);
  const [error, setError] = useState<string | null>(null);

  const { mutate: removeConversation } = remove;
  const confirmDelete = useCallback(
    (item: AssistantConversation) => {
      confirmAction({
        title: t('assistant.history.deleteTitle'),
        message: t('assistant.history.deleteMessage'),
        confirmLabel: t('common.actions.delete'),
        cancelLabel: t('common.actions.cancel'),
        destructive: true,
        onConfirm: () => {
          setError(null);
          removeConversation(item.id, { onError: (failure) => setError(messageFor(failure)) });
        },
      });
    },
    [t, removeConversation],
  );
  const renderItem = useCallback<ListRenderItem<AssistantConversation>>(
    ({ item }) => (
      <ConversationRow
        item={item}
        onOpen={openConversation}
        onDelete={confirmDelete}
        deleteLabel={t('assistant.history.delete')}
      />
    ),
    [confirmDelete, t],
  );

  if (list.isPending) return <Skeleton variant="list" />;
  if (list.isError) {
    return <ErrorState message={messageFor(list.error)} onRetry={() => list.refetch()} />;
  }

  const items = list.data.pages.flatMap((page) => page.items);

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
        <AiNotice kind="privacy">{t('assistant.history.privacy')}</AiNotice>
        {error ? (
          <Banner tone="danger" testID="error-message">
            {error}
          </Banner>
        ) : null}
      </View>
      <FlatList
        testID="conversation-list"
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState icon="message-text-outline" message={t('assistant.history.empty')} />
        }
        renderItem={renderItem}
        onEndReachedThreshold={0.4}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        ListFooterComponent={<ListFooter loading={list.isFetchingNextPage} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </View>
  );
}

function openConversation(id: string) {
  router.dismissTo({ pathname: '/assistant', params: { conversation: id } });
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
  const open = useCallback(() => onOpen(item.id), [onOpen, item.id]);
  const remove = useCallback(() => onDelete(item), [onDelete, item]);
  return (
    <View style={styles.row}>
      <ListRow
        title={item.title ?? ''}
        meta={formatDateTime(item.updatedAt)}
        onPress={open}
        accessibilityLabel={item.title ?? ''}
        testID={`conversation-${item.title}`}
      />
      {/* Sibling of the pressable card: a button inside another button is invalid on web. */}
      <IconButton
        icon="delete-outline"
        iconColor={colors.error}
        accessibilityLabel={deleteLabel}
        onPress={remove}
        style={styles.delete}
        testID={`delete-${item.title}`}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: { justifyContent: 'center' },
  delete: { position: 'absolute', right: space[1] },
  screen: { flex: 1 },
  top: { padding: space[4], gap: space[3], width: '100%', maxWidth: 720, alignSelf: 'center' },
  list: {
    padding: space[4],
    paddingTop: 0,
    gap: space[3],
    flexGrow: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
});
