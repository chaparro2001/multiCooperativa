import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { routeServerError } from '@/forms/server-errors';
import { useForm } from '@/forms/use-form';
import {
  useAddAttachment,
  useAnnouncement,
  useAnnouncementAction,
  useCreateAnnouncement,
  useUpdateAnnouncement,
} from '@/features/announcements/queries';
import {
  ANNOUNCEMENT_FIELDS,
  ANNOUNCEMENT_SERVER_MAPPING,
  type AnnouncementMode,
  validateAnnouncement,
} from '@/features/announcements/form-validation';
import { pickPdf } from '@/features/shared/pdf-upload';
import { formatSize } from '@/i18n/format';
import { Button } from '@/ui/button';
import { FormSummary } from '@/ui/field';
import { Text, useTheme } from '@/ui/paper';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';

const TITLE_MAX = 120;
const BODY_MAX = 5000;
const MAX_ATTACHMENTS = 3;

/** US-ANN-01 and US-ANN-05: draft, attachments (up to 3 PDF) and publish. */
export default function AnnouncementEditorScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
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

  // A draft may be saved incomplete; publishing (or editing a published one) needs title and body.
  const isDraft = (existing.data?.status ?? 'draft') === 'draft';
  const form = useForm({
    values: { title, body },
    validate: (values, mode) =>
      validateAnnouncement(values, mode === 'publish' || !isDraft ? 'publish' : 'draft'),
  });

  useEffect(() => {
    if (!loaded && existing.data) {
      setTitle(existing.data.title);
      setBody(existing.data.body);
      setLoaded(true);
    }
  }, [existing.data, loaded]);

  if (!loaded) return <Loading />;
  const status = existing.data?.status ?? 'draft';
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

  async function run(task: () => Promise<void>, mode: AnnouncementMode = 'draft') {
    setError(null);
    setNotice(null);
    if (!form.validateAll(mode)) return;
    try {
      await task();
    } catch (failure) {
      // BR-ANN-04: a missing title or body is marked on its field.
      const routed = routeServerError(failure, ANNOUNCEMENT_SERVER_MAPPING, (field) =>
        (ANNOUNCEMENT_FIELDS as readonly string[]).includes(field),
      );
      form.setServerErrors(routed.fields);
      setError(routed.banner);
    }
  }

  const busy = create.isPending || update.isPending || attach.isPending || action.isPending;

  return (
    <Screen testID="announcement-editor" form={form}>
      <Stack.Screen
        options={{
          title: id ? t('announcements.editor.editTitle') : t('announcements.editor.newTitle'),
        }}
      />
      <TextField
        label={t('announcements.editor.titleLabel', { length: title.length, max: TITLE_MAX })}
        name="title"
        value={title}
        onChangeText={setTitle}
        maxLength={TITLE_MAX}
        testID="title-field"
      />
      <TextField
        label={t('announcements.editor.bodyLabel', { length: body.length, max: BODY_MAX })}
        name="body"
        value={body}
        onChangeText={setBody}
        maxLength={BODY_MAX}
        multiline
        textAlignVertical="top"
        style={styles.body}
        testID="body-field"
      />
      {status === 'published' ? (
        <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
          {t('announcements.editor.publishedHint')}
        </Text>
      ) : null}

      <View style={styles.section}>
        <Text variant="titleSmall">
          {t('announcements.editor.attachments', {
            current: attachments.length,
            max: MAX_ATTACHMENTS,
          })}
        </Text>
        {attachments.map((attachment) => (
          <Text key={attachment.id} variant="bodyMedium">
            {attachment.name} · {formatSize(attachment.size)}
          </Text>
        ))}
        {attachments.length < MAX_ATTACHMENTS ? (
          <Button
            title={t('announcements.editor.addPdf')}
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
            testID="add-attachment"
          />
        ) : null}
      </View>

      {error ? <ErrorText>{error}</ErrorText> : null}
      <FormSummary form={form} />
      {notice ? (
        <Text variant="bodyMedium" style={{ color: colors.primary }}>
          {notice}
        </Text>
      ) : null}

      <Button
        title={
          status === 'draft'
            ? t('announcements.editor.saveDraft')
            : t('announcements.editor.saveChanges')
        }
        variant="secondary"
        loading={create.isPending || update.isPending}
        disabled={busy}
        onPress={() =>
          run(async () => {
            await save();
            setNotice(t('common.saved'));
          })
        }
        testID="save-announcement"
      />
      {status === 'draft' ? (
        <Button
          title={t('common.actions.publish')}
          loading={action.isPending}
          disabled={busy}
          onPress={() =>
            run(async () => {
              const targetId = await save();
              await action.mutateAsync({ id: targetId, action: 'publish' });
              router.replace(`/announcements/${targetId}`);
            }, 'publish')
          }
          testID="publish-from-editor"
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { minHeight: 200, paddingTop: 12 },
  section: { gap: 8 },
});
