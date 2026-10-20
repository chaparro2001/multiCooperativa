import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { colors } from '@/ui/theme';
import { openUrl } from '@/ui/open-url';
import { confirmAction } from '@/ui/confirm';

/** US-ANN-03 (read), US-ANN-05/06/07 (manage). */
export default function AnnouncementScreen() {
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
        {announcement.pinned && <Badge label={t('announcements.pinned')} tone="info" />}
        {announcement.status === 'draft' && (
          <Badge label={t('enums.announcementStatus.draft')} tone="warning" />
        )}
        {announcement.status === 'withdrawn' && (
          <Badge label={t('enums.announcementStatus.withdrawn')} tone="danger" />
        )}
      </View>
      <Text style={styles.title}>{announcement.title || t('common.untitled')}</Text>
      <Text style={styles.meta}>
        {announcement.authorName ?? t('announcements.detail.unknownAuthor')}
        {announcement.publishedAt ? ` · ${formatDateTime(announcement.publishedAt)}` : ''}
      </Text>
      {announcement.editedAt && (
        <Text style={styles.meta}>
          {t('announcements.detail.editedOn', { date: formatDateTime(announcement.editedAt) })}
        </Text>
      )}

      {/* NFR-ANN-02: plain text, never interpreted as HTML. */}
      <Text style={styles.body} selectable>
        {announcement.body}
      </Text>

      {announcement.attachments.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('announcements.detail.attachments')}</Text>
          {announcement.attachments.map((attachment) => (
            <Pressable
              key={attachment.id}
              accessibilityRole="button"
              onPress={() => run(() => openAttachment(attachment.id))}
              style={({ pressed }) => [styles.attachment, pressed && styles.pressed]}
              testID={`attachment-${attachment.name}`}
            >
              <Text style={styles.attachmentName}>{attachment.name}</Text>
              <Text style={styles.meta}>{formatSize(attachment.size)}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {canManage && (
        <View style={styles.section}>
          {announcement.readStats && (
            <Text style={styles.stats} testID="read-stats">
              {t('announcements.detail.readStats', {
                readCount: announcement.readStats.readCount,
                count: announcement.readStats.activeMembers,
              })}
            </Text>
          )}
          {error && <ErrorText>{error}</ErrorText>}
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
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', gap: 6 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
  section: { gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  attachment: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, gap: 2 },
  attachmentName: { fontSize: 15, color: colors.primary, fontWeight: '500' },
  pressed: { opacity: 0.7 },
  stats: { fontSize: 15, color: colors.text },
});
