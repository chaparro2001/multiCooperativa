import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { collect } from '@/forms/errors';
import { dayMessage } from '@/forms/rules';
import { routeServerError } from '@/forms/server-errors';
import { useForm } from '@/forms/use-form';
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
import { DayField } from '@/ui/date-field';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { openUrl } from '@/ui/open-url';
import { Card, Text, useTheme } from '@/ui/paper';
import { colors } from '@/ui/theme';

/** US-INV-06 (detail), US-INV-04 (reconciliation) and US-INV-07 (settle). */
export default function InvoiceScreen() {
  const theme = useTheme();
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
  const form = useForm({
    values: { settleDate },
    validate: (values) => collect({ settleDate: dayMessage(values.settleDate) }),
  });

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

  async function settleInvoice() {
    setError(null);
    if (!form.validateAll()) return;
    try {
      await settle.mutateAsync({ id, date: settleDate });
    } catch (failure) {
      // The payment date is the only input: a rule about it is marked on the date field.
      const routed = routeServerError(
        failure,
        { fields: { date: 'settleDate' } },
        (field) => field === 'settleDate',
      );
      form.setServerErrors(routed.fields);
      setError(routed.banner);
    }
  }

  return (
    <Screen testID="invoice-screen" form={form}>
      <Text variant="titleLarge">{data.thirdParty.name}</Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
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
          <Text
            variant="labelLarge"
            style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}
          >
            {t('invoicing.detail.discrepancies')}
          </Text>
          {data.discrepancies.map((item) => (
            <Card key={item.id} mode="contained" style={styles.discrepancy}>
              <Card.Content style={styles.discrepancyContent}>
                <Text variant="titleSmall">{item.concept}</Text>
                <Text variant="bodyMedium">
                  {t('invoicing.detail.deliveredVsInvoiced', {
                    delivered: item.deliveredQuantity,
                    invoiced: item.invoicedQuantity,
                    unit: item.unit,
                  })}
                </Text>
                {item.explanation && (
                  <Text variant="bodyMedium" style={styles.explanation}>
                    {item.explanation}
                  </Text>
                )}
              </Card.Content>
            </Card>
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
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('invoicing.detail.numericGoverns')}
          </Text>
        </View>
      )}

      {data.lines.length > 0 && (
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
      )}

      <View style={styles.block}>
        <Text
          variant="labelLarge"
          style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}
        >
          {t('invoicing.detail.deliveryNotes')}
        </Text>
        {data.deliveryNotes.length === 0 ? (
          <Text variant="bodyMedium">{t('invoicing.detail.noDeliveryNotes')}</Text>
        ) : (
          data.deliveryNotes.map((note) => (
            <Pressable
              key={note.id}
              accessibilityRole="link"
              onPress={() => router.push(`/invoices/delivery-note/${note.id}`)}
            >
              <Text variant="bodyLarge" style={{ color: theme.colors.primary }}>
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
        <Text variant="bodyLarge" style={{ color: theme.colors.primary }}>
          {t('invoicing.detail.viewThirdParty')}
        </Text>
      </Pressable>

      {error && <ErrorText>{error}</ErrorText>}

      {canManage && open && (
        <View style={styles.block}>
          <DayField
            label={t(`invoicing.detail.settleDate.${data.operation}`)}
            name="settleDate"
            value={settleDate}
            onChange={setSettleDate}
            testID="settle-date"
          />
          <Button
            title={t(`invoicing.detail.settle.${data.operation}`)}
            loading={settle.isPending}
            onPress={settleInvoice}
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
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  block: { gap: 8 },
  sectionTitle: { textTransform: 'uppercase' },
  discrepancy: { backgroundColor: colors.warningContainer },
  discrepancyContent: { gap: 4 },
  explanation: { fontStyle: 'italic' },
});
