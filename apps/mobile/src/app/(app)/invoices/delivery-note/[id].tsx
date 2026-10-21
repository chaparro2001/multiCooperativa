import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { ConfirmButton } from '@/features/invoicing/confirm-button';
import { Fact } from '@/features/invoicing/components';
import {
  useDeliveryNote,
  useFreshDeliveryNoteUrl,
  useVoidDocument,
} from '@/features/invoicing/queries';
import { formatDay } from '@/i18n/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { openUrl } from '@/ui/open-url';
import { Text, useTheme } from '@/ui/paper';

/** US-INV-06: delivery note with its lines, status, invoice and original. */
export default function DeliveryNoteScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { canManage } = useModuleAccess('invoicing');
  const note = useDeliveryNote(id);
  const freshUrl = useFreshDeliveryNoteUrl();
  const voidNote = useVoidDocument();
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  if (note.isPending) return <Loading />;
  if (note.isError) {
    return (
      <Screen>
        <ErrorText>{messageFor(note.error)}</ErrorText>
      </Screen>
    );
  }
  const data = note.data;

  async function run(task: () => Promise<unknown>) {
    setError(null);
    try {
      await task();
    } catch (failure) {
      setError(messageFor(failure));
    }
  }

  return (
    <Screen testID="delivery-note-screen">
      <Text variant="titleLarge">{data.thirdParty.name}</Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {t('invoicing.detail.noteTitle', { number: data.number })} ·{' '}
        {t(`enums.operation.${data.operation}`)}
      </Text>
      <Badge
        label={t(`enums.deliveryNoteStatus.${data.status}`)}
        tone={data.status === 'pending_invoicing' ? 'warning' : 'neutral'}
      />
      <View style={styles.block}>
        <Fact label={t('invoicing.detail.noteDate')}>{formatDay(data.date)}</Fact>
      </View>

      <View style={styles.block}>
        <Text
          variant="labelLarge"
          style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}
        >
          {t('invoicing.detail.lines')}
        </Text>
        {data.lines.map((line, index) => (
          <Text key={index} variant="bodyMedium">
            {line.concept} · {line.quantity} {line.unit}
          </Text>
        ))}
      </View>

      {data.invoiceId ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(`/invoices/invoice/${data.invoiceId}`)}
        >
          <Text variant="bodyLarge" style={{ color: theme.colors.primary }}>
            {t('invoicing.detail.viewInvoice')}
          </Text>
        </Pressable>
      ) : null}

      {data.fileUrl ? (
        <Button
          title={t('invoicing.detail.openFile')}
          variant="secondary"
          loading={opening}
          onPress={() =>
            run(async () => {
              setOpening(true);
              try {
                const url = await freshUrl(id);
                if (url) await openUrl(url);
              } finally {
                setOpening(false);
              }
            })
          }
          testID="open-file"
        />
      ) : null}

      {error ? <ErrorText>{error}</ErrorText> : null}

      {canManage && data.status === 'pending_invoicing' && (
        <ConfirmButton
          title={t('invoicing.detail.void')}
          message={t('invoicing.detail.voidNoteMessage')}
          loading={voidNote.isPending}
          onConfirm={() =>
            run(async () => {
              await voidNote.mutateAsync({ id, kind: 'delivery-note' });
              router.back();
            })
          }
          testID="void-note"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  sectionTitle: { textTransform: 'uppercase' },
});
