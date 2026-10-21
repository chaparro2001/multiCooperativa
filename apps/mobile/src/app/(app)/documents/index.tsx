import { Plus } from 'lucide-react-native';
import type { DocumentSearchHit, DocumentSummary } from '@multicooperativa/contracts';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { groupByCategory } from '@/features/documents/grouping';
import { useDocumentList, useDocumentSearch } from '@/features/documents/queries';
import { formatDay } from '@/i18n/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { ErrorText, Loading } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';
import { HeaderAction, HeaderActions } from '@/ui/header-action';

type Mode = 'title' | 'content';

/** US-DOC-02 (by category, filter by title) and US-DOC-07 (by content). */
export default function DocumentListScreen() {
  const { t } = useTranslation();
  const { canManage } = useModuleAccess('documents');
  const [mode, setMode] = useState<Mode>('title');
  const [text, setText] = useState('');

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: canManage
            ? () => (
                <HeaderActions>
                  <HeaderAction
                    href="/documents/upload"
                    icon={Plus}
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
        <View style={styles.modes} accessibilityRole="tablist">
          {(['title', 'content'] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === value }}
              onPress={() => setMode(value)}
              style={[styles.mode, mode === value && styles.modeSelected]}
              testID={`mode-${value}`}
            >
              <Text style={[styles.modeText, mode === value && styles.modeTextSelected]}>
                {t(`documents.list.mode.${value}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {mode === 'title' ? (
        <ByTitle search={text} canManage={canManage} />
      ) : (
        <ByContent query={text} />
      )}
    </View>
  );
}

function ByTitle({ search, canManage }: { search: string; canManage: boolean }) {
  const { t } = useTranslation();
  const list = useDocumentList(search);
  if (list.isPending) return <Loading />;
  if (list.isError) return <ErrorText>{messageFor(list.error)}</ErrorText>;

  return (
    <SectionList
      testID="document-list"
      sections={groupByCategory(list.data.items)}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {search ? t('documents.list.noMatch') : t('documents.list.empty')}
        </Text>
      }
      renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
      renderItem={({ item }) => <DocumentRow item={item} canManage={canManage} />}
    />
  );
}

function DocumentRow({ item, canManage }: { item: DocumentSummary; canManage: boolean }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/documents/${item.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`document-${item.title}`}
    >
      <Text style={styles.title}>{item.title}</Text>
      <View style={styles.meta}>
        <Text style={styles.detail}>{formatDay(item.documentDate)}</Text>
        {item.status === 'withdrawn' && (
          <Badge label={t('enums.documentStatus.withdrawn')} tone="danger" />
        )}
        {canManage && item.indexingStatus && item.indexingStatus !== 'indexed' && (
          <Badge
            label={
              item.indexingStatus === 'pending'
                ? t('documents.list.indexing')
                : t('documents.list.notAvailableForAssistant')
            }
            tone="warning"
          />
        )}
      </View>
    </Pressable>
  );
}

function ByContent({ query }: { query: string }) {
  const { t } = useTranslation();
  const search = useDocumentSearch(query);
  if (query.trim().length < 3) {
    return <Text style={styles.empty}>{t('documents.list.minChars', { min: 3 })}</Text>;
  }
  if (search.isPending) return <Loading />;
  if (search.isError) return <ErrorText>{messageFor(search.error)}</ErrorText>;

  return (
    <FlatList
      testID="content-results"
      data={search.data.items}
      keyExtractor={(hit, i) => `${hit.documentId}-${hit.page}-${i}`}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>{t('documents.list.noResults')}</Text>}
      renderItem={({ item }) => <HitRow hit={item} />}
    />
  );
}

function HitRow({ hit }: { hit: DocumentSearchHit }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/documents/${hit.documentId}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.title}>
        {t('documents.list.hitTitle', { title: hit.title, page: hit.page })}
      </Text>
      <Text style={styles.excerpt} numberOfLines={4}>
        {hit.excerpt}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  search: { padding: 16, paddingBottom: 8, gap: 10 },
  modes: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 10, padding: 3 },
  mode: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  modeSelected: { backgroundColor: '#fff' },
  modeText: { color: colors.muted, fontWeight: '500' },
  modeTextSelected: { color: colors.text },
  list: { padding: 16, paddingTop: 0, gap: 10 },
  section: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    marginTop: 12,
  },
  empty: { color: colors.muted, fontSize: 15, padding: 16, textAlign: 'center' },
  row: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 6 },
  pressed: { opacity: 0.7 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  detail: { fontSize: 13, color: colors.muted },
  excerpt: { fontSize: 14, color: colors.text, lineHeight: 20 },
});
