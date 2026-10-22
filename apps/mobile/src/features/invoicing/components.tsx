import type {
  DeliveryNote,
  Invoice,
  InvoicingSettings,
  Operation,
  PaymentStatus,
  ReconciliationStatus,
} from '@multicooperativa/contracts';
import { router } from 'expo-router';
import { memo, type ReactNode, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { currentLocale, formatDay } from '@/i18n/format';
import { Badge } from '@/ui/badge';
import { ListRow } from '@/ui/list-row';
import { Text, useTheme } from '@/ui/paper';
import { space } from '@/ui/theme';

import { formatEuros } from './amounts';
import { type InvoiceAttention, invoiceAttention, noteAttention } from './attention';

export const useEuros = () => (amount: string) => formatEuros(amount, currentLocale());

const PAYMENT_TONE = {
  pending: 'info',
  overdue: 'danger',
  settled: 'neutral',
  voided: 'neutral',
} as const;

export function PaymentBadge({
  status,
  operation,
}: {
  status: PaymentStatus;
  operation: Operation;
}) {
  const { t } = useTranslation();
  const label =
    status === 'settled'
      ? t(`enums.settledStatus.${operation}`)
      : t(`enums.paymentStatus.${status}`);
  return <Badge label={label} tone={PAYMENT_TONE[status]} />;
}

const RECONCILIATION_TONE = {
  no_delivery_notes: 'neutral',
  reconciled: 'info',
  with_discrepancy: 'warning',
} as const;

export function ReconciliationBadge({ status }: { status: ReconciliationStatus }) {
  const { t } = useTranslation();
  return (
    <Badge label={t(`enums.reconciliationStatus.${status}`)} tone={RECONCILIATION_TONE[status]} />
  );
}

/** BR-INV-16: why an invoice counts in the home badge (filled; replaces the payment badge when overdue). */
export function InvoiceAttentionBadge({ attention }: { attention: InvoiceAttention }) {
  const { t } = useTranslation();
  const dueLine = useDueLine();
  if (attention.kind === 'overdue') {
    return (
      <Badge
        label={t('invoicing.attention.overdueDays', { count: attention.days })}
        tone="danger"
      />
    );
  }
  return <Badge label={dueLine(attention)} tone="warning" />;
}

type DueAttention = Exclude<InvoiceAttention, { kind: 'overdue' }>;

/** The due date in words: "Vence hoy", "Vence en 3 días". */
function useDueLine() {
  const { t } = useTranslation();
  return (attention: DueAttention): string =>
    attention.kind === 'dueToday'
      ? t('invoicing.attention.dueToday')
      : t('invoicing.attention.dueInDays', { count: attention.days });
}

/**
 * Known issue 1: ONE filled badge (payment, or the overdue days), the due line in words with a
 * clock when it counts in the home badge, and the reconciliation as a quiet badge only when
 * there is a discrepancy. Memoized: the long lists re-render only the rows whose invoice (or
 * alert settings) changed.
 */
export const InvoiceRow = memo(function InvoiceRow({
  invoice,
  settings,
  today,
}: {
  invoice: Invoice;
  /** With the cooperative's alert settings the row says why it counts in the home badge (BR-INV-16). */
  settings?: InvoicingSettings;
  today?: string;
}) {
  const { t } = useTranslation();
  const dueLine = useDueLine();
  const attention = useMemo(
    () => (settings && today ? invoiceAttention(invoice, today, settings) : null),
    [invoice, settings, today],
  );
  const onPress = useCallback(() => router.push(`/invoices/invoice/${invoice.id}`), [invoice.id]);
  const status =
    attention?.kind === 'overdue' ? (
      <InvoiceAttentionBadge attention={attention} />
    ) : (
      <PaymentBadge status={invoice.paymentStatus} operation={invoice.operation} />
    );
  const badges =
    invoice.reconciliationStatus === 'with_discrepancy' ? (
      <Badge
        label={t('enums.reconciliationStatus.with_discrepancy')}
        tone="warning"
        icon="alert-outline"
        quiet
      />
    ) : undefined;
  return (
    <ListRow
      title={invoice.thirdParty.name}
      amount={invoice.total}
      status={status}
      badges={badges}
      meta={`${t('invoicing.row.invoiceNumber', { number: invoice.number })} · ${t('invoicing.row.due', { date: formatDay(invoice.dueDate) })}`}
      alert={
        attention && attention.kind !== 'overdue'
          ? { tone: 'warning', text: dueLine(attention) }
          : undefined
      }
      onPress={onPress}
      testID={`invoice-${invoice.number}`}
    />
  );
});

export const NoteRow = memo(function NoteRow({
  note,
  settings,
  today,
}: {
  note: DeliveryNote;
  /** With the cooperative's alert settings the row says how old it is when it counts in the home badge (BR-INV-16). */
  settings?: InvoicingSettings;
  today?: string;
}) {
  const { t } = useTranslation();
  const attention = useMemo(
    () => (settings && today ? noteAttention(note, today, settings) : null),
    [note, settings, today],
  );
  const onPress = useCallback(() => router.push(`/invoices/delivery-note/${note.id}`), [note.id]);
  const status = attention ? (
    <Badge
      label={t('invoicing.attention.noteDays', { count: attention.days })}
      tone={attention.stale ? 'danger' : 'warning'}
    />
  ) : (
    <Badge
      label={t(`enums.deliveryNoteStatus.${note.status}`)}
      tone={note.status === 'pending_invoicing' ? 'warning' : 'neutral'}
    />
  );
  return (
    <ListRow
      title={note.thirdParty.name}
      status={status}
      meta={`${t('invoicing.row.noteNumber', { number: note.number })} · ${formatDay(note.date)}`}
      onPress={onPress}
      testID={`delivery-note-${note.number}`}
    />
  );
});

/** Label / value line of a detail screen. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  const muted = useMutedText();
  return (
    <View style={styles.fact}>
      <Text variant="bodyMedium" style={muted}>
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.factValue}>
        {children}
      </Text>
    </View>
  );
}

/** Secondary text colour from the theme, memoized so rows keep stable style references. */
function useMutedText() {
  const { colors: theme } = useTheme();
  return useMemo(() => ({ color: theme.onSurfaceVariant }), [theme.onSurfaceVariant]);
}

const styles = StyleSheet.create({
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3] },
  factValue: { fontWeight: '500', flexShrink: 1, textAlign: 'right' },
});
