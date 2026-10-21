import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { withPage } from '@/features/assistant/chat';
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
import { openUrl } from '@/ui/open-url';
import { confirmAction } from '@/ui/confirm';

const INDEXING_TONE = {
  pending: 'warning',
  indexed: 'info',
  error: 'danger',
  not_indexable: 'danger',
} as const;

/** US-DOC-03 (view) and US-DOC-04/05/06 (versions, withdraw, indexing). */
export default function DocumentScreen() {
  const { t } = useTranslation();
  // `page` comes from an assistant citation (US-AI-01): the viewer opens at that page.
  const { id, page } = useLocalSearchParams<{ id: string; page?: string }>();
  const { canManage } = useModuleAccess('documents');
  const document = useDocument(id);
  const versions = useDocumentVersions(id, canManage);
  const freshUrl = useFreshDocumentUrl();
  const addVersion = useAddVersion();
  const action = useDocumentAction();
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [republished, setRepublished] = useState(false);

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
    confirmAction({
      title: t('documents.detail.withdrawTitle'),
      message: t('documents.detail.withdrawMessage'),
      confirmLabel: t('common.actions.withdraw'),
      cancelLabel: t('common.actions.cancel'),
      destructive: true,
      onConfirm: () => run(() => action.mutateAsync({ id, action: 'withdraw' })),
    });
  }

  function confirmRepublish() {
    confirmAction({
      title: t('documents.detail.republishTitle'),
      message: t('documents.detail.republishMessage'),
      confirmLabel: t('documents.detail.republishTitle'),
      cancelLabel: t('common.actions.cancel'),
      onConfirm: () =>
        run(async () => {
          await action.mutateAsync({ id, action: 'republish' });
          setRepublished(true);
        }),
    });
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
              await openUrl(withPage(await freshUrl(id), page));
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

          {data.status === 'withdrawn' && (
            <Badge label={t('documents.list.notAvailableForAssistant')} tone="warning" />
          )}

          {republished && data.status === 'published' && (
            <Text style={styles.success} testID="republished">
              {t('documents.detail.republished')}
            </Text>
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

          {data.status === 'withdrawn' && (
            <Button
              title={t('documents.detail.republishTitle')}
              loading={action.isPending}
              onPress={confirmRepublish}
              testID="republish"
            />
          )}

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
  success: { fontSize: 14, color: colors.text },
  version: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, gap: 2 },
  versionName: { fontSize: 15, color: colors.text },
});
