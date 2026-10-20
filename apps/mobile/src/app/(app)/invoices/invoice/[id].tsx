import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { subtractAmounts } from '@/features/invoicing/amounts';
import { ConfirmButton } from '@/features/invoicing/confirm-button';
import { Fact, PaymentBadge, ReconciliationBadge, useEuros } from '@/features/invoicing/components';
import {
  useExplainDiscrepancies,
  useFreshInvoiceUrl,
  useInvoice,
  useSettleInvoice,
  useVoidDocument,
} from '@/features/invoicing/queries';
import { formatDay, today } from '@/i18n/format';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Button } from '@/ui/button';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';
import { openUrl } from '@/ui/open-url';

/** US-INV-06 (detail), US-INV-04 (reconciliation) and US-INV-07 (settle). */
export default function InvoiceScreen() {
  const { t } = useTranslation();
  const euros = useEuros();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { canManage } = useModuleAccess('invoicing');
  const invoice = useInvoice(id);
  const freshUrl = useFreshInvoiceUrl();
  const settle = useSettleInvoice();
  const explain = useExplainDiscrepancies();
  const voidInvoice = useVoidDocument();
  const [settleDate, setSettleDate] = useState(() => today());
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  if (invoice.isPending) return <Loading />;
  if (invoice.isError) {
    return (
      <Screen>
        <ErrorText>{messageFor(invoice.error)}</ErrorText>
      </Screen>
    );
  }
  const data = invoice.data;
  const open = data.paymentStatus === 'pending' || data.paymentStatus === 'overdue';

  async function run(task: () => Promise<unknown>) {
    setError(null);
    try {
      await task();
    } catch (failure) {
      setError(messageFor(failure));
    }
  }

  return (
    <Screen testID="invoice-screen">
      <Text style={styles.title}>{data.thirdParty.name}</Text>
      <Text style={styles.subtitle}>
        {t('invoicing.detail.invoiceTitle', { number: data.number })} ·{' '}
        {t(`enums.operation.${data.operation}`)}
      </Text>
      <View style={styles.badges}>
        <PaymentBadge status={data.paymentStatus} operation={data.operation} />
        <ReconciliationBadge status={data.reconciliationStatus} />
      </View>

      <View style={styles.block}>
        <Fact label={t('invoicing.detail.issueDate')}>{formatDay(data.issueDate)}</Fact>
        <Fact label={t('invoicing.detail.dueDate')}>{formatDay(data.dueDate)}</Fact>
        <Fact label={t('invoicing.detail.base')}>{euros(data.base)}</Fact>
        <Fact label={t('invoicing.detail.vat', { rate: data.vatRate })}>
          {euros(subtractAmounts(data.total, data.base))}
        </Fact>
        <Fact label={t('invoicing.detail.total')}>{euros(data.total)}</Fact>
        {data.settledAt && (
          <Fact label={t(`invoicing.detail.settledOn.${data.operation}`)}>
            {formatDay(data.settledAt)}
          </Fact>
        )}
      </View>

      {data.fileUrl && (
        <Button
          title={t('invoicing.detail.openFile')}
          variant="secondary"
          loading={opening}
          onPress={() =>
            run(async () => {
              setOpening(true);
              try {
                // A fresh 5-minute link every time (NFR-INV-02).
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

      {data.reconciliationStatus === 'with_discrepancy' && (
        <View style={styles.block} testID="discrepancies">
          <Text style={styles.sectionTitle}>{t('invoicing.detail.discrepancies')}</Text>
          {data.discrepancies.map((item) => (
            <View key={item.id} style={styles.discrepancy}>
              <Text style={styles.concept}>{item.concept}</Text>
              <Text style={styles.detail}>
                {t('invoicing.detail.deliveredVsInvoiced', {
                  delivered: item.deliveredQuantity,
                  invoiced: item.invoicedQuantity,
                  unit: item.unit,
                })}
              </Text>
              {item.explanation && <Text style={styles.explanation}>{item.explanation}</Text>}
            </View>
          ))}
          {data.discrepancies.some((item) => !item.explanation) && (
            <Button
              title={t('invoicing.detail.explain')}
              variant="secondary"
              loading={explain.isPending}
              onPress={() => run(() => explain.mutateAsync(id))}
              testID="explain-discrepancies"
            />
          )}
          <Text style={styles.hint}>{t('invoicing.detail.numericGoverns')}</Text>
        </View>
      )}

      {data.lines.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.sectionTitle}>{t('invoicing.detail.lines')}</Text>
          {data.lines.map((line, index) => (
            <Text key={index} style={styles.detail}>
              {line.concept} · {line.quantity} {line.unit}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.block}>
        <Text style={styles.sectionTitle}>{t('invoicing.detail.deliveryNotes')}</Text>
        {data.deliveryNotes.length === 0 ? (
          <Text style={styles.detail}>{t('invoicing.detail.noDeliveryNotes')}</Text>
        ) : (
          data.deliveryNotes.map((note) => (
            <Pressable
              key={note.id}
              accessibilityRole="link"
              onPress={() => router.push(`/invoices/delivery-note/${note.id}`)}
            >
              <Text style={styles.link}>
                {t('invoicing.row.noteNumber', { number: note.number })} · {formatDay(note.date)}
              </Text>
            </Pressable>
          ))
        )}
      </View>

      <Pressable
        accessibilityRole="link"
        onPress={() => router.push(`/invoices/third-parties/${data.thirdParty.id}`)}
      >
        <Text style={styles.link}>{t('invoicing.detail.viewThirdParty')}</Text>
      </Pressable>

      {error && <ErrorText>{error}</ErrorText>}

      {canManage && open && (
        <View style={styles.block}>
          <TextField
            label={t(`invoicing.detail.settleDate.${data.operation}`)}
            value={settleDate}
            onChangeText={setSettleDate}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            testID="settle-date"
          />
          <Button
            title={t(`invoicing.detail.settle.${data.operation}`)}
            loading={settle.isPending}
            disabled={!/^\d{4}-\d{2}-\d{2}$/.test(settleDate)}
            onPress={() => run(() => settle.mutateAsync({ id, date: settleDate }))}
            testID="settle-invoice"
          />
          <ConfirmButton
            title={t('invoicing.detail.void')}
            message={t('invoicing.detail.voidInvoiceMessage')}
            loading={voidInvoice.isPending}
            onConfirm={() =>
              run(async () => {
                await voidInvoice.mutateAsync({ id, kind: 'invoice' });
                router.back();
              })
            }
            testID="void-invoice"
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  block: { gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  detail: { fontSize: 14, color: colors.text },
  hint: { fontSize: 12, color: colors.muted },
  link: { fontSize: 15, color: colors.primary },
  discrepancy: { backgroundColor: '#fff4d6', borderRadius: 10, padding: 10, gap: 4 },
  concept: { fontSize: 15, fontWeight: '600', color: colors.text },
  explanation: { fontSize: 14, color: colors.text, fontStyle: 'italic' },
});
