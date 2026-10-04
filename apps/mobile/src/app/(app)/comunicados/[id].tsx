import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import {
  useAnnouncement,
  useAnnouncementAction,
  useUpdateAnnouncement,
} from '@/features/announcements/queries';
import { formatDateTime, formatSize } from '@/features/shared/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { colors } from '@/ui/theme';

/** HU-COM-03 (read), HU-COM-05/06/07 (manage). */
export default function AnnouncementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { canManage } = useModuleAccess('comunicados');
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

  /** Links last 5 minutes: ask for fresh ones right before opening (RNF-COM-03). */
  async function openAttachment(attachmentId: string) {
    const fresh = await detail.refetch();
    const url = fresh.data?.attachments.find((a) => a.id === attachmentId)?.url;
    if (url) await WebBrowser.openBrowserAsync(url);
  }

  function confirmWithdraw() {
    Alert.alert(
      'Retirar comunicado',
      'Dejará de estar visible para los miembros. No se puede deshacer.',
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

  return (
    <Screen testID="pantalla-comunicado">
      <Stack.Screen options={{ title: 'Comunicado' }} />
      <View style={styles.badges}>
        {announcement.pinned && <Badge label="Fijado" tone="info" />}
        {announcement.status === 'borrador' && <Badge label="Borrador" tone="warning" />}
        {announcement.status === 'retirado' && <Badge label="Retirado" tone="danger" />}
      </View>
      <Text style={styles.title}>{announcement.title || 'Sin título'}</Text>
      <Text style={styles.meta}>
        {announcement.authorName ?? 'Autor desconocido'}
        {announcement.publishedAt ? ` · ${formatDateTime(announcement.publishedAt)}` : ''}
      </Text>
      {announcement.editedAt && (
        <Text style={styles.meta}>Editado el {formatDateTime(announcement.editedAt)}</Text>
      )}

      {/* RNF-COM-02: plain text, never interpreted as HTML. */}
      <Text style={styles.body} selectable>
        {announcement.body}
      </Text>

      {announcement.attachments.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Adjuntos</Text>
          {announcement.attachments.map((attachment) => (
            <Pressable
              key={attachment.id}
              accessibilityRole="button"
              onPress={() => run(() => openAttachment(attachment.id))}
              style={({ pressed }) => [styles.attachment, pressed && styles.pressed]}
              testID={`adjunto-${attachment.name}`}
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
            <Text style={styles.stats} testID="lecturas">
              Leído por {announcement.readStats.readCount} de {announcement.readStats.activeMembers}{' '}
              miembros
            </Text>
          )}
          {error && <ErrorText>{error}</ErrorText>}
          {announcement.status !== 'retirado' && (
            <Button
              title="Editar"
              variant="secondary"
              onPress={() => router.push({ pathname: '/comunicados/editor', params: { id } })}
              testID="editar-comunicado"
            />
          )}
          {announcement.status === 'borrador' && (
            <Button
              title="Publicar"
              loading={action.isPending}
              onPress={() => run(() => action.mutateAsync({ id, action: 'publicar' }))}
              testID="publicar-comunicado"
            />
          )}
          {announcement.status === 'publicado' && (
            <>
              <Button
                title={announcement.pinned ? 'Quitar fijado' : 'Fijar arriba'}
                variant="secondary"
                loading={update.isPending}
                onPress={() =>
                  run(() => update.mutateAsync({ id, changes: { pinned: !announcement.pinned } }))
                }
              />
              <Button title="Retirar" variant="danger" onPress={confirmWithdraw} />
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
