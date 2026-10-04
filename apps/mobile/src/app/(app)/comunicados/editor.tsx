import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import {
  useAddAttachment,
  useAnnouncement,
  useAnnouncementAction,
  useCreateAnnouncement,
  useUpdateAnnouncement,
} from '@/features/announcements/queries';
import { formatSize } from '@/features/shared/format';
import { pickPdf } from '@/features/shared/pdf-upload';
import { Button } from '@/ui/button';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';

const TITLE_MAX = 120;
const BODY_MAX = 5000;

/** HU-COM-01 and HU-COM-05: draft, attachments (up to 3 PDF) and publish. */
export default function AnnouncementEditorScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const [id, setId] = useState(params.id);
  const existing = useAnnouncement(id);
  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();
  const attach = useAddAttachment();
  const action = useAnnouncementAction();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState(!params.id);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded && existing.data) {
      setTitle(existing.data.title);
      setBody(existing.data.body);
      setLoaded(true);
    }
  }, [existing.data, loaded]);

  if (!loaded) return <Loading />;
  const status = existing.data?.status ?? 'borrador';
  const attachments = existing.data?.attachments ?? [];

  /** Saves and returns the id (creating the draft the first time). */
  async function save(): Promise<string> {
    if (id) {
      await update.mutateAsync({ id, changes: { title, body } });
      return id;
    }
    const created = await create.mutateAsync({ title, body });
    const newId = (created as { id: string }).id;
    setId(newId);
    return newId;
  }

  async function run(task: () => Promise<void>) {
    setError(null);
    setNotice(null);
    try {
      await task();
    } catch (failure) {
      setError(messageFor(failure));
    }
  }

  const busy = create.isPending || update.isPending || attach.isPending || action.isPending;

  return (
    <Screen testID="editor-comunicado">
      <Stack.Screen options={{ title: id ? 'Editar comunicado' : 'Nuevo comunicado' }} />
      <TextField
        label={`Título (${title.length}/${TITLE_MAX})`}
        value={title}
        onChangeText={setTitle}
        maxLength={TITLE_MAX}
        testID="campo-titulo"
      />
      <TextField
        label={`Texto (${body.length}/${BODY_MAX})`}
        value={body}
        onChangeText={setBody}
        maxLength={BODY_MAX}
        multiline
        textAlignVertical="top"
        style={styles.body}
        testID="campo-cuerpo"
      />
      {status === 'publicado' && (
        <Text style={styles.hint}>
          Está publicado: los cambios se verán como «editado» y no se reenvía el aviso.
        </Text>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Adjuntos ({attachments.length}/3)</Text>
        {attachments.map((attachment) => (
          <Text key={attachment.id} style={styles.attachment}>
            {attachment.name} · {formatSize(attachment.size)}
          </Text>
        ))}
        {attachments.length < 3 && (
          <Button
            title="Añadir PDF"
            variant="secondary"
            loading={attach.isPending}
            disabled={busy}
            onPress={() =>
              run(async () => {
                const pdf = await pickPdf();
                if (!pdf) return;
                const targetId = await save();
                await attach.mutateAsync({ id: targetId, pdf });
              })
            }
            testID="anadir-adjunto"
          />
        )}
      </View>

      {error && <ErrorText>{error}</ErrorText>}
      {notice && <Text style={styles.notice}>{notice}</Text>}

      <Button
        title={status === 'borrador' ? 'Guardar borrador' : 'Guardar cambios'}
        variant="secondary"
        loading={create.isPending || update.isPending}
        disabled={busy}
        onPress={() =>
          run(async () => {
            await save();
            setNotice('Guardado.');
          })
        }
        testID="guardar-comunicado"
      />
      {status === 'borrador' && (
        <Button
          title="Publicar"
          loading={action.isPending}
          disabled={busy}
          onPress={() =>
            run(async () => {
              const targetId = await save();
              await action.mutateAsync({ id: targetId, action: 'publicar' });
              router.replace(`/comunicados/${targetId}`);
            })
          }
          testID="publicar-desde-editor"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { minHeight: 200, paddingTop: 12 },
  hint: { fontSize: 13, color: colors.muted },
  section: { gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  attachment: { fontSize: 14, color: colors.text },
  notice: { color: colors.primary },
});
