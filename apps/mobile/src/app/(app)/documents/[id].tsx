import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

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
import { Card } from '@/ui/card';
import { Divider, Text, useTheme } from '@/ui/paper';
import { SectionTitle } from '@/ui/section-title';
import { ErrorText, Screen } from '@/ui/screen';
import { ErrorState, Skeleton } from '@/ui/states';
import { space } from '@/ui/theme';
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
  const { colors } = useTheme();
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

  if (document.isPending) return <Skeleton variant="detail" />;
  if (document.isError) {
    return (
      <Screen>
        <ErrorState message={messageFor(document.error)} onRetry={() => document.refetch()} />
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
      <Text variant="headlineSmall">{data.title}</Text>
      <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
        {formatDay(data.documentDate)} · {formatSize(data.size)}
      </Text>
      {data.status === 'withdrawn' ? (
        <Badge label={t('enums.documentStatus.withdrawn')} tone="danger" />
      ) : null}

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

      {canManage ? (
        <View style={styles.section}>
          <Divider />
          {indexingStatus ? (
            <View style={styles.indexing}>
              <Badge
                label={t(`enums.indexingStatus.${indexingStatus}`)}
                tone={INDEXING_TONE[indexingStatus]}
              />
              {(indexingStatus === 'error' || indexingStatus === 'not_indexable') &&
              data.status === 'published' ? (
                <Button
                  title={t('documents.detail.retryIndexing')}
                  variant="secondary"
                  loading={action.isPending}
                  onPress={() => run(() => action.mutateAsync({ id, action: 'reindex' }))}
                  testID="reindex"
                />
              ) : null}
            </View>
          ) : null}

          {data.status === 'withdrawn' ? (
            <Badge label={t('documents.list.notAvailableForAssistant')} tone="warning" />
          ) : null}

          {republished && data.status === 'published' ? (
            <Text variant="bodyMedium" testID="republished">
              {t('documents.detail.republished')}
            </Text>
          ) : null}

          {error ? <ErrorText>{error}</ErrorText> : null}

          {data.status === 'published' ? (
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
          ) : null}

          <SectionTitle small>{t('documents.detail.versionHistory')}</SectionTitle>
          {versions.data?.versions.map((version) => (
            <Card key={version.id} style={styles.version}>
              <Text variant="bodyLarge">
                {version.isCurrent
                  ? t('documents.detail.currentVersion', { name: version.fileName })
                  : version.fileName}
              </Text>
              <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
                {formatDateTime(version.uploadedAt)}
                {version.uploadedByName ? ` · ${version.uploadedByName}` : ''} ·{' '}
                {formatSize(version.size)}
              </Text>
            </Card>
          ))}

          {data.status === 'withdrawn' ? (
            <Button
              title={t('documents.detail.republishTitle')}
              loading={action.isPending}
              onPress={confirmRepublish}
              testID="republish"
            />
          ) : null}

          {data.status === 'published' ? (
            <Button
              title={t('documents.detail.withdrawTitle')}
              variant="danger"
              onPress={confirmWithdraw}
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: space[3] },
  indexing: { gap: space[2] },
  version: { gap: space[1] },
});
