import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { categoryTitle } from '@/features/documents/grouping';
import {
  useAddVersion,
  useDocument,
  useDocumentAction,
  useDocumentVersions,
  useFreshDocumentUrl,
} from '@/features/documents/queries';
import { pickPdf } from '@/features/shared/pdf-upload';
import { formatDateTime, formatDay, formatSize } from '@/i18n/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { colors } from '@/ui/theme';

const INDEXING_TONE = {
  pending: 'warning',
  indexed: 'info',
  error: 'danger',
  not_indexable: 'danger',
} as const;

/** US-DOC-03 (view) and US-DOC-04/05/06 (versions, withdraw, indexing). */
export default function DocumentScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { canManage } = useModuleAccess('documents');
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
    Alert.alert(t('documents.detail.withdrawTitle'), t('documents.detail.withdrawMessage'), [
      { text: t('common.actions.cancel'), style: 'cancel' },
      {
        text: t('common.actions.withdraw'),
        style: 'destructive',
        onPress: () => run(() => action.mutateAsync({ id, action: 'withdraw' })),
      },
    ]);
  }

  const indexingStatus = data.indexingStatus;

  return (
    <Screen testID="document-screen">
      <Stack.Screen options={{ title: categoryTitle(data.category) }} />
      <Text style={styles.title}>{data.title}</Text>
      <Text style={styles.meta}>
        {formatDay(data.documentDate)} · {formatSize(data.size)}
      </Text>
      {data.status === 'withdrawn' && (
        <Badge label={t('enums.documentStatus.withdrawn')} tone="danger" />
      )}

      <Button
        title={t('documents.detail.open')}
        loading={opening}
        onPress={() =>
          run(async () => {
            setOpening(true);
            try {
              // A fresh 5-minute link every time (NFR-DOC-02).
              await WebBrowser.openBrowserAsync(await freshUrl(id));
            } finally {
              setOpening(false);
            }
          })
        }
        testID="open-document"
      />

      {canManage && (
        <View style={styles.section}>
          {indexingStatus && (
            <View style={styles.indexing}>
              <Badge
                label={t(`enums.indexingStatus.${indexingStatus}`)}
                tone={INDEXING_TONE[indexingStatus]}
              />
              {(indexingStatus === 'error' || indexingStatus === 'not_indexable') &&
                data.status === 'published' && (
                  <Button
                    title={t('documents.detail.retryIndexing')}
                    variant="secondary"
                    loading={action.isPending}
                    onPress={() => run(() => action.mutateAsync({ id, action: 'reindex' }))}
                    testID="reindex"
                  />
                )}
            </View>
          )}

          {error && <ErrorText>{error}</ErrorText>}

          {data.status === 'published' && (
            <Button
              title={t('documents.detail.uploadVersion')}
              variant="secondary"
              loading={addVersion.isPending}
              onPress={() =>
                run(async () => {
                  const pdf = await pickPdf();
                  if (pdf) await addVersion.mutateAsync({ id, pdf });
                })
              }
              testID="new-version"
            />
          )}

          <Text style={styles.sectionTitle}>{t('documents.detail.versionHistory')}</Text>
          {versions.data?.versions.map((version) => (
            <View key={version.id} style={styles.version}>
              <Text style={styles.versionName}>
                {version.isCurrent
                  ? t('documents.detail.currentVersion', { name: version.fileName })
                  : version.fileName}
              </Text>
              <Text style={styles.meta}>
                {formatDateTime(version.uploadedAt)}
                {version.uploadedByName ? ` · ${version.uploadedByName}` : ''} ·{' '}
                {formatSize(version.size)}
              </Text>
            </View>
          ))}

          {data.status === 'published' && (
            <Button
              title={t('documents.detail.withdrawTitle')}
              variant="danger"
              onPress={confirmWithdraw}
            />
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
