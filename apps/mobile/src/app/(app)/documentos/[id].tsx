import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { CATEGORY_TITLES } from '@/features/documents/grouping';
import {
  useAddVersion,
  useDocument,
  useDocumentAction,
  useDocumentVersions,
  useFreshDocumentUrl,
} from '@/features/documents/queries';
import { formatDateTime, formatDay, formatSize } from '@/features/shared/format';
import { pickPdf } from '@/features/shared/pdf-upload';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { colors } from '@/ui/theme';

const INDEXING = {
  pendiente: { label: 'Indexando para el asistente…', tone: 'warning' },
  indexado: { label: 'Disponible para el asistente', tone: 'info' },
  error: { label: 'Error al indexar', tone: 'danger' },
  no_indexable: { label: 'No se puede indexar', tone: 'danger' },
} as const;

/** HU-DOC-03 (view) and HU-DOC-04/05/06 (versions, withdraw, indexing). */
export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { canManage } = useModuleAccess('documentos');
  const document = useDocument(id);
  const versions = useDocumentVersions(id, canManage);
  const freshUrl = useFreshDocumentUrl();
  const addVersion = useAddVersion();
  const action = useDocumentAction();
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  if (document.isPending) return <Loading />;
  if (document.isError) {
    return (
      <Screen>
        <ErrorText>{messageFor(document.error)}</ErrorText>
      </Screen>
    );
  }
  const data = document.data;

  async function run(task: () => Promise<unknown>) {
    setError(null);
    try {
      await task();
    } catch (failure) {
      setError(messageFor(failure));
    }
  }

  function confirmWithdraw() {
    Alert.alert(
      'Retirar documento',
      'Dejará de estar disponible para los miembros y para el asistente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Retirar',
          style: 'destructive',
          onPress: () => run(() => action.mutateAsync({ id, action: 'retirar' })),
        },
      ],
    );
  }

  const indexing = data.indexingStatus ? INDEXING[data.indexingStatus] : null;

  return (
    <Screen testID="pantalla-documento">
      <Stack.Screen options={{ title: CATEGORY_TITLES[data.category] }} />
      <Text style={styles.title}>{data.title}</Text>
      <Text style={styles.meta}>
        {formatDay(data.documentDate)} · {formatSize(data.size)}
      </Text>
      {data.status === 'retirado' && <Badge label="Retirado" tone="danger" />}

      <Button
        title="Abrir documento"
        loading={opening}
        onPress={() =>
          run(async () => {
            setOpening(true);
            try {
              // A fresh 5-minute link every time (RNF-DOC-02).
              await WebBrowser.openBrowserAsync(await freshUrl(id));
            } finally {
              setOpening(false);
            }
          })
        }
        testID="abrir-documento"
      />

      {canManage && (
        <View style={styles.section}>
          {indexing && (
            <View style={styles.indexing}>
              <Badge label={indexing.label} tone={indexing.tone} />
              {data.indexingError && <Text style={styles.meta}>{data.indexingError}</Text>}
              {(data.indexingStatus === 'error' || data.indexingStatus === 'no_indexable') &&
                data.status === 'publicado' && (
                  <Button
                    title="Reintentar indexación"
                    variant="secondary"
                    loading={action.isPending}
                    onPress={() => run(() => action.mutateAsync({ id, action: 'reindexar' }))}
                    testID="reindexar"
                  />
                )}
            </View>
          )}

          {error && <ErrorText>{error}</ErrorText>}

          {data.status === 'publicado' && (
            <Button
              title="Subir nueva versión"
              variant="secondary"
              loading={addVersion.isPending}
              onPress={() =>
                run(async () => {
                  const pdf = await pickPdf();
                  if (pdf) await addVersion.mutateAsync({ id, pdf });
                })
              }
              testID="nueva-version"
            />
          )}

          <Text style={styles.sectionTitle}>Historial de versiones</Text>
          {versions.data?.versions.map((version) => (
            <View key={version.id} style={styles.version}>
              <Text style={styles.versionName}>
                {version.fileName}
                {version.isCurrent ? ' · vigente' : ''}
              </Text>
              <Text style={styles.meta}>
                {formatDateTime(version.uploadedAt)}
                {version.uploadedByName ? ` · ${version.uploadedByName}` : ''} ·{' '}
                {formatSize(version.size)}
              </Text>
            </View>
          ))}

          {data.status === 'publicado' && (
            <Button title="Retirar documento" variant="danger" onPress={confirmWithdraw} />
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  section: { gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 8 },
  indexing: { gap: 8 },
  version: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, gap: 2 },
  versionName: { fontSize: 15, color: colors.text },
});
