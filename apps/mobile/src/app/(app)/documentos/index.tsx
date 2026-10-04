import type { DocumentSearchHit, DocumentSummary } from '@multicooperativa/contracts';
import { Link, router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { groupByCategory } from '@/features/documents/grouping';
import { useDocumentList, useDocumentSearch } from '@/features/documents/queries';
import { formatDay } from '@/features/shared/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { ErrorText, Loading } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';

type Mode = 'titulo' | 'contenido';

/** HU-DOC-02 (by category, filter by title) and HU-DOC-07 (by content). */
export default function DocumentListScreen() {
  const { canManage } = useModuleAccess('documentos');
  const [mode, setMode] = useState<Mode>('titulo');
  const [text, setText] = useState('');

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: canManage
            ? () => (
                <Link href="/documentos/subir" testID="subir-documento">
                  <Text style={styles.headerLink}>Subir</Text>
                </Link>
              )
            : undefined,
        }}
      />
      <View style={styles.search}>
        <TextField
          label={mode === 'titulo' ? 'Buscar por título' : 'Pregunta o tema'}
          value={text}
          onChangeText={setText}
          placeholder={mode === 'titulo' ? 'Estatutos, acta…' : '¿Cuándo se celebra la asamblea?'}
          autoCorrect={mode === 'contenido'}
          returnKeyType="search"
          testID="buscador-documentos"
        />
        <View style={styles.modes} accessibilityRole="tablist">
          {(['titulo', 'contenido'] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === value }}
              onPress={() => setMode(value)}
              style={[styles.mode, mode === value && styles.modeSelected]}
              testID={`modo-${value}`}
            >
              <Text style={[styles.modeText, mode === value && styles.modeTextSelected]}>
                {value === 'titulo' ? 'Título' : 'Contenido'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {mode === 'titulo' ? (
        <ByTitle search={text} canManage={canManage} />
      ) : (
        <ByContent query={text} />
      )}
    </View>
  );
}

function ByTitle({ search, canManage }: { search: string; canManage: boolean }) {
  const list = useDocumentList(search);
  if (list.isPending) return <Loading />;
  if (list.isError) return <ErrorText>{messageFor(list.error)}</ErrorText>;

  return (
    <SectionList
      testID="lista-documentos"
      sections={groupByCategory(list.data.items)}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {search ? 'Ningún título coincide.' : 'Todavía no hay documentos.'}
        </Text>
      }
      renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
      renderItem={({ item }) => <DocumentRow item={item} canManage={canManage} />}
    />
  );
}

function DocumentRow({ item, canManage }: { item: DocumentSummary; canManage: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/documentos/${item.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`documento-${item.title}`}
    >
      <Text style={styles.title}>{item.title}</Text>
      <View style={styles.meta}>
        <Text style={styles.detail}>{formatDay(item.documentDate)}</Text>
        {item.status === 'retirado' && <Badge label="Retirado" tone="danger" />}
        {canManage && item.indexingStatus && item.indexingStatus !== 'indexado' && (
          <Badge
            label={
              item.indexingStatus === 'pendiente' ? 'Indexando' : 'No disponible para el asistente'
            }
            tone="warning"
          />
        )}
      </View>
    </Pressable>
  );
}

function ByContent({ query }: { query: string }) {
  const search = useDocumentSearch(query);
  if (query.trim().length < 3) {
    return (
      <Text style={styles.empty}>Escribe al menos 3 caracteres para buscar en el contenido.</Text>
    );
  }
  if (search.isPending) return <Loading />;
  if (search.isError) return <ErrorText>{messageFor(search.error)}</ErrorText>;

  return (
    <FlatList
      testID="resultados-contenido"
      data={search.data.items}
      keyExtractor={(hit, i) => `${hit.documentId}-${hit.page}-${i}`}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>No se ha encontrado nada parecido.</Text>}
      renderItem={({ item }) => <HitRow hit={item} />}
    />
  );
}

function HitRow({ hit }: { hit: DocumentSearchHit }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/documentos/${hit.documentId}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.title}>
        {hit.title} · pág. {hit.page}
      </Text>
      <Text style={styles.excerpt} numberOfLines={4}>
        {hit.excerpt}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  headerLink: { color: colors.primary, fontSize: 16 },
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
