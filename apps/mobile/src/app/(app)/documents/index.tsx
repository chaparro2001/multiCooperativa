import type { DocumentSearchHit, DocumentSummary } from '@multicooperativa/contracts';
import { router, Stack } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, SectionList, StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { groupByCategory } from '@/features/documents/grouping';
import { useDocumentList, useDocumentSearch } from '@/features/documents/queries';
import { formatDay } from '@/i18n/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Card, List, SegmentedButtons, Text, useTheme } from '@/ui/paper';
import { ErrorText, Loading } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { HeaderAction, HeaderActions } from '@/ui/header-action';

type Mode = 'title' | 'content';

/** US-DOC-02 (by category, filter by title) and US-DOC-07 (by content). */
export default function DocumentListScreen() {
  const { t } = useTranslation();
  const { canManage } = useModuleAccess('documents');
  const [mode, setMode] = useState<Mode>('title');
  const [text, setText] = useState('');
  const { colors } = useTheme();
  const modeButtons = useMemo(
    () =>
      (['title', 'content'] as const).map((value) => ({
        value,
        label: t(`documents.list.mode.${value}`),
        testID: `mode-${value}`,
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
        <SegmentedButtons
          value={mode}
          onValueChange={(value) => setMode(value as Mode)}
          buttons={modeButtons}
        />
      </View>
      {mode === 'title' ? (
        <ByTitle search={text} canManage={canManage} />
      ) : (
        <ByContent query={text} />
      )}
    </View>
  );
}

const keyById = (item: DocumentSummary) => item.id;
const keyByHit = (hit: DocumentSearchHit, i: number) => `${hit.documentId}-${hit.page}-${i}`;

const renderSectionHeader = ({ section }: { section: { title: string } }) => (
  <List.Subheader style={styles.section}>{section.title}</List.Subheader>
);

function ByTitle({ search, canManage }: { search: string; canManage: boolean }) {
  const { t } = useTranslation();
  const list = useDocumentList(search);
  const { colors } = useTheme();
  const renderItem = useCallback(
    ({ item }: { item: DocumentSummary }) => <DocumentRow item={item} canManage={canManage} />,
    [canManage],
  );
  if (list.isPending) return <Loading />;
  if (list.isError) return <ErrorText>{messageFor(list.error)}</ErrorText>;

  return (
    <SectionList
      testID="document-list"
      sections={groupByCategory(list.data.items)}
      keyExtractor={keyById}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      ListEmptyComponent={
        <Text variant="bodyMedium" style={[styles.empty, { color: colors.onSurfaceVariant }]}>
          {search ? t('documents.list.noMatch') : t('documents.list.empty')}
        </Text>
      }
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
    />
  );
}

const DocumentRow = memo(function DocumentRow({
  item,
  canManage,
}: {
  item: DocumentSummary;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const open = useCallback(() => router.push(`/documents/${item.id}`), [item.id]);
  return (
    <Card
      mode="contained"
      accessibilityRole="button"
      onPress={open}
      testID={`document-${item.title}`}
    >
      <Card.Content style={styles.content}>
        <Text variant="titleMedium">{item.title}</Text>
        <View style={styles.meta}>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
            {formatDay(item.documentDate)}
          </Text>
          {item.status === 'withdrawn' ? (
            <Badge label={t('enums.documentStatus.withdrawn')} tone="danger" />
          ) : null}
          {canManage && item.indexingStatus && item.indexingStatus !== 'indexed' ? (
            <Badge
              label={
                item.indexingStatus === 'pending'
                  ? t('documents.list.indexing')
                  : t('documents.list.notAvailableForAssistant')
              }
              tone="warning"
            />
          ) : null}
        </View>
      </Card.Content>
    </Card>
  );
});

function ByContent({ query }: { query: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const search = useDocumentSearch(query);
  const renderItem = useCallback(
    ({ item }: { item: DocumentSearchHit }) => <HitRow hit={item} />,
    [],
  );
  if (query.trim().length < 3) {
    return (
      <Text variant="bodyMedium" style={[styles.empty, { color: colors.onSurfaceVariant }]}>
        {t('documents.list.minChars', { min: 3 })}
      </Text>
    );
  }
  if (search.isPending) return <Loading />;
  if (search.isError) return <ErrorText>{messageFor(search.error)}</ErrorText>;

  return (
    <FlatList
      testID="content-results"
      data={search.data.items}
      keyExtractor={keyByHit}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <Text variant="bodyMedium" style={[styles.empty, { color: colors.onSurfaceVariant }]}>
          {t('documents.list.noResults')}
        </Text>
      }
      renderItem={renderItem}
    />
  );
}

const HitRow = memo(function HitRow({ hit }: { hit: DocumentSearchHit }) {
  const { t } = useTranslation();
  const open = useCallback(() => router.push(`/documents/${hit.documentId}`), [hit.documentId]);
  return (
    <Card mode="contained" accessibilityRole="button" onPress={open}>
      <Card.Content style={styles.content}>
        <Text variant="titleMedium">
          {t('documents.list.hitTitle', { title: hit.title, page: hit.page })}
        </Text>
        <Text variant="bodyMedium" numberOfLines={4}>
          {hit.excerpt}
        </Text>
      </Card.Content>
    </Card>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  search: { padding: 16, paddingBottom: 8, gap: 10 },
  list: { padding: 16, paddingTop: 0, gap: 10 },
  section: { paddingHorizontal: 0, marginTop: 4 },
  empty: { padding: 16, textAlign: 'center' },
  content: { gap: 6 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
});
