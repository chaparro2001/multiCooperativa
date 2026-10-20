import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
import { colors } from '@/ui/theme';
import { openUrl } from '@/ui/open-url';

/** US-INV-06: delivery note with its lines, status, invoice and original. */
export default function DeliveryNoteScreen() {
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
      <Text style={styles.title}>{data.thirdParty.name}</Text>
      <Text style={styles.subtitle}>
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
        <Text style={styles.sectionTitle}>{t('invoicing.detail.lines')}</Text>
        {data.lines.map((line, index) => (
          <Text key={index} style={styles.detail}>
            {line.concept} · {line.quantity} {line.unit}
          </Text>
        ))}
      </View>

      {data.invoiceId && (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(`/invoices/invoice/${data.invoiceId}`)}
        >
          <Text style={styles.link}>{t('invoicing.detail.viewInvoice')}</Text>
        </Pressable>
      )}

      {data.fileUrl && (
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
      )}

      {error && <ErrorText>{error}</ErrorText>}

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
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted },
  block: { gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  detail: { fontSize: 14, color: colors.text },
  link: { fontSize: 15, color: colors.primary },
});
