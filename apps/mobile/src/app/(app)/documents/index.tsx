import type { DocumentSearchHit, DocumentSummary } from '@multicooperativa/contracts';
import { router, Stack } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, SectionList, StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { allItems } from '@/api/paged';
import { useLoadMore } from '@/api/use-load-more';
import { groupByCategory } from '@/features/documents/grouping';
import { useDocumentList, useDocumentSearch } from '@/features/documents/queries';
import { formatDay } from '@/i18n/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { SourceCard } from '@/features/assistant/components';
import { Badge } from '@/ui/badge';
import { Segmented } from '@/ui/chip';
import { HeaderAction, HeaderActions } from '@/ui/header-action';
import { ListRow } from '@/ui/list-row';
import { useTheme } from '@/ui/paper';
import { SectionTitle } from '@/ui/section-title';
import { EmptyState, ErrorState, ListFooter, Skeleton } from '@/ui/states';
import { TextField } from '@/ui/text-field';
import { space } from '@/ui/theme';
import { useDebouncedValue } from '@/ui/use-debounced-value';

type Mode = 'title' | 'content';

/** US-DOC-02 (by category, filter by title) and US-DOC-07 (by content). */
export default function DocumentListScreen() {
  const { t } = useTranslation();
  const { canManage } = useModuleAccess('documents');
  const [mode, setMode] = useState<Mode>('title');
  const [text, setText] = useState('');
  // The server is asked once the user stops typing, not on every keystroke.
  const query = useDebouncedValue(text);
  const { colors } = useTheme();
  const modeOptions = useMemo(
    () =>
      (['title', 'content'] as const).map((value) => ({
        value,
        label: t(`documents.list.mode.${value}`),
      })),
    [t],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerRight: canManage
            ? () => (
                <HeaderActions>
                  <HeaderAction
                    href="/documents/upload"
                    icon="plus"
                    label={t('documents.list.upload')}
                    testID="upload-document"
                  />
                </HeaderActions>
              )
            : undefined,
        }}
      />
      <View style={styles.search}>
        <TextField
          label={
            mode === 'title'
              ? t('documents.list.searchByTitle')
              : t('documents.list.searchByContent')
          }
          value={text}
          onChangeText={setText}
          placeholder={
            mode === 'title'
              ? t('documents.list.placeholderTitle')
              : t('documents.list.placeholderContent')
          }
          autoCorrect={mode === 'content'}
          returnKeyType="search"
          testID="document-search"
        />
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={modeOptions}
          testIDPrefix="mode"
        />
      </View>
      {mode === 'title' ? (
        <ByTitle search={query} canManage={canManage} />
      ) : (
        <ByContent query={query} />
      )}
    </View>
  );
}

const keyById = (item: DocumentSummary) => item.id;
const keyByHit = (hit: DocumentSearchHit, i: number) => `${hit.documentId}-${hit.page}-${i}`;

const renderSectionHeader = ({ section }: { section: { title: string } }) => (
  <SectionTitle>{section.title}</SectionTitle>
);

function ByTitle({ search, canManage }: { search: string; canManage: boolean }) {
  const { t } = useTranslation();
  const list = useDocumentList(search);
  const renderItem = useCallback(
    ({ item }: { item: DocumentSummary }) => <DocumentRow item={item} canManage={canManage} />,
    [canManage],
  );
  const loadMore = useLoadMore(list);
  const sections = useMemo(() => groupByCategory(allItems(list.data)), [list.data]);
  if (list.isPending) return <Skeleton variant="list" />;
  if (list.isError) {
    return <ErrorState message={messageFor(list.error)} onRetry={() => list.refetch()} />;
  }

  return (
    <SectionList
      testID="document-list"
      sections={sections}
      onEndReachedThreshold={0.4}
      onEndReached={loadMore}
      ListFooterComponent={<ListFooter loading={list.isFetchingNextPage} />}
      keyExtractor={keyById}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      ItemSeparatorComponent={Separator}
      ListEmptyComponent={
        <EmptyState
          icon="file-document-outline"
          message={search ? t('documents.list.noMatch') : t('documents.list.empty')}
        />
      }
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
    />
  );
}

const Separator = () => <View style={styles.separator} />;

const DocumentRow = memo(function DocumentRow({
  item,
  canManage,
}: {
  item: DocumentSummary;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const open = useCallback(() => router.push(`/documents/${item.id}`), [item.id]);
  // One badge per row: withdrawn first, otherwise (managers) the indexing state.
  const status =
    item.status === 'withdrawn' ? (
      <Badge label={t('enums.documentStatus.withdrawn')} tone="danger" />
    ) : canManage && item.indexingStatus && item.indexingStatus !== 'indexed' ? (
      <Badge
        label={
          item.indexingStatus === 'pending'
            ? t('documents.list.indexing')
            : t('documents.list.notAvailableForAssistant')
        }
        tone="warning"
      />
    ) : undefined;
  return (
    <ListRow
      title={item.title}
      meta={formatDay(item.documentDate)}
      status={status}
      onPress={open}
      testID={`document-${item.title}`}
    />
  );
});

function ByContent({ query }: { query: string }) {
  const { t } = useTranslation();
  const search = useDocumentSearch(query);
  const renderItem = useCallback(
    ({ item }: { item: DocumentSearchHit }) => <HitRow hit={item} query={query} />,
    [query],
  );
  if (query.trim().length < 3) {
    return <EmptyState icon="text-search" message={t('documents.list.minChars', { min: 3 })} />;
  }
  if (search.isPending) return <Skeleton variant="list" />;
  if (search.isError) {
    return <ErrorState message={messageFor(search.error)} onRetry={() => search.refetch()} />;
  }

  return (
    <FlatList
      testID="content-results"
      data={search.data.items}
      keyExtractor={keyByHit}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={Separator}
      ListEmptyComponent={<EmptyState icon="text-search" message={t('documents.list.noResults')} />}
      renderItem={renderItem}
    />
  );
}

const HitRow = memo(function HitRow({ hit, query }: { hit: DocumentSearchHit; query: string }) {
  const { t } = useTranslation();
  const open = useCallback(() => router.push(`/documents/${hit.documentId}`), [hit.documentId]);
  return (
    <SourceCard
      title={t('documents.list.hitTitle', { title: hit.title, page: hit.page })}
      excerpt={hit.excerpt}
      excerptLines={4}
      highlight={query}
      onPress={open}
    />
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  search: { padding: space[4], paddingBottom: space[2], gap: space[3] },
  list: { padding: space[4], paddingTop: 0 },
  separator: { height: space[3] },
});
