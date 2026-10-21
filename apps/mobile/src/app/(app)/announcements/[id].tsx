import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import {
  useAnnouncement,
  useAnnouncementAction,
  useUpdateAnnouncement,
} from '@/features/announcements/queries';
import { formatDateTime, formatSize } from '@/i18n/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card, Divider, Text, useTheme } from '@/ui/paper';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { openUrl } from '@/ui/open-url';
import { confirmAction } from '@/ui/confirm';

/** US-ANN-03 (read), US-ANN-05/06/07 (manage). */
export default function AnnouncementScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { canManage } = useModuleAccess('announcements');
  const detail = useAnnouncement(id);
  const action = useAnnouncementAction();
  const update = useUpdateAnnouncement();
  const [error, setError] = useState<string | null>(null);

  if (detail.isPending) return <Loading />;
  if (detail.isError) {
    return (
      <Screen>
        <ErrorText>{messageFor(detail.error)}</ErrorText>
      </Screen>
    );
  }
  const announcement = detail.data;

  async function run(task: () => Promise<unknown>) {
    setError(null);
    try {
      await task();
    } catch (failure) {
      setError(messageFor(failure));
    }
  }

  /** Links last 5 minutes: ask for fresh ones right before opening (NFR-ANN-03). */
  async function openAttachment(attachmentId: string) {
    const fresh = await detail.refetch();
    const url = fresh.data?.attachments.find((a) => a.id === attachmentId)?.url;
    if (url) await openUrl(url);
  }

  function confirmWithdraw() {
    confirmAction({
      title: t('announcements.detail.withdrawTitle'),
      message: t('announcements.detail.withdrawMessage'),
      confirmLabel: t('common.actions.withdraw'),
      cancelLabel: t('common.actions.cancel'),
      destructive: true,
      onConfirm: () => run(() => action.mutateAsync({ id, action: 'withdraw' })),
    });
  }

  return (
    <Screen testID="announcement-screen">
      <Stack.Screen options={{ title: t('announcements.detail.title') }} />
      <View style={styles.badges}>
        {announcement.pinned ? <Badge label={t('announcements.pinned')} tone="info" /> : null}
        {announcement.status === 'draft' ? (
          <Badge label={t('enums.announcementStatus.draft')} tone="warning" />
        ) : null}
        {announcement.status === 'withdrawn' ? (
          <Badge label={t('enums.announcementStatus.withdrawn')} tone="danger" />
        ) : null}
      </View>
      <Text variant="headlineSmall">{announcement.title || t('common.untitled')}</Text>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
        {announcement.authorName ?? t('announcements.detail.unknownAuthor')}
        {announcement.publishedAt ? ` · ${formatDateTime(announcement.publishedAt)}` : ''}
      </Text>
      {announcement.editedAt ? (
        <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
          {t('announcements.detail.editedOn', { date: formatDateTime(announcement.editedAt) })}
        </Text>
      ) : null}

      {/* NFR-ANN-02: plain text, never interpreted as HTML. */}
      <Text variant="bodyLarge" selectable>
        {announcement.body}
      </Text>

      {announcement.attachments.length > 0 ? (
        <View style={styles.section}>
          <Divider />
          <Text variant="titleSmall">{t('announcements.detail.attachments')}</Text>
          {announcement.attachments.map((attachment) => (
            <Card
              key={attachment.id}
              mode="contained"
              accessibilityRole="button"
              onPress={() => run(() => openAttachment(attachment.id))}
              testID={`attachment-${attachment.name}`}
            >
              <Card.Content style={styles.attachment}>
                <Text variant="titleSmall" style={{ color: colors.primary }}>
                  {attachment.name}
                </Text>
                <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
                  {formatSize(attachment.size)}
                </Text>
              </Card.Content>
            </Card>
          ))}
        </View>
      ) : null}

      {canManage ? (
        <View style={styles.section}>
          <Divider />
          {announcement.readStats ? (
            <Text variant="bodyMedium" testID="read-stats">
              {t('announcements.detail.readStats', {
                readCount: announcement.readStats.readCount,
                count: announcement.readStats.activeMembers,
              })}
            </Text>
          ) : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
          {announcement.status !== 'withdrawn' && (
            <Button
              title={t('common.actions.edit')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/announcements/editor', params: { id } })}
              testID="edit-announcement"
            />
          )}
          {announcement.status === 'draft' && (
            <Button
              title={t('common.actions.publish')}
              loading={action.isPending}
              onPress={() => run(() => action.mutateAsync({ id, action: 'publish' }))}
              testID="publish-announcement"
            />
          )}
          {announcement.status === 'published' && (
            <>
              <Button
                title={
                  announcement.pinned
                    ? t('announcements.detail.unpin')
                    : t('announcements.detail.pin')
                }
                variant="secondary"
                loading={update.isPending}
                onPress={() =>
                  run(() => update.mutateAsync({ id, changes: { pinned: !announcement.pinned } }))
                }
              />
              <Button
                title={t('common.actions.withdraw')}
                variant="danger"
                onPress={confirmWithdraw}
              />
            </>
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', gap: 6 },
  section: { gap: 10 },
  attachment: { gap: 2 },
});
