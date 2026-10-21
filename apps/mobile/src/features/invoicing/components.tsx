import type {
  DeliveryNote,
  Invoice,
  Operation,
  PaymentStatus,
  ReconciliationStatus,
} from '@multicooperativa/contracts';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { currentLocale, formatDay } from '@/i18n/format';
import { Badge } from '@/ui/badge';
import { colors } from '@/ui/theme';

import { formatEuros } from './amounts';
import type { InvoiceAttention, NoteAttention } from './attention';

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

/** BR-INV-16: why an invoice counts in the home badge. */
export function InvoiceAttentionBadge({ attention }: { attention: InvoiceAttention }) {
  const { t } = useTranslation();
  if (attention.kind === 'overdue') {
    return (
      <Badge
        label={t('invoicing.attention.overdueDays', { count: attention.days })}
        tone="danger"
      />
    );
  }
  return (
    <Badge
      label={
        attention.kind === 'dueToday'
          ? t('invoicing.attention.dueToday')
          : t('invoicing.attention.dueInDays', { count: attention.days })
      }
      tone="warning"
    />
  );
}

export function InvoiceRow({
  invoice,
  attention = null,
}: {
  invoice: Invoice;
  /** Set when the invoice counts in the home badge (BR-INV-16): highlighted with its reason. */
  attention?: InvoiceAttention | null;
}) {
  const { t } = useTranslation();
  const euros = useEuros();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/invoices/invoice/${invoice.id}`)}
      style={({ pressed }) => [
        styles.row,
        attention && styles.attention,
        pressed && styles.pressed,
      ]}
      testID={`invoice-${invoice.number}`}
    >
      <View style={styles.rowTop}>
        <Text style={styles.title}>{invoice.thirdParty.name}</Text>
        <Text style={styles.amount}>{euros(invoice.total)}</Text>
      </View>
      <Text style={styles.detail}>
        {t('invoicing.row.invoiceNumber', { number: invoice.number })} ·{' '}
        {t('invoicing.row.due', { date: formatDay(invoice.dueDate) })}
      </Text>
      <View style={styles.badges}>
        {attention?.kind === 'overdue' ? null : (
          <PaymentBadge status={invoice.paymentStatus} operation={invoice.operation} />
        )}
        {attention && <InvoiceAttentionBadge attention={attention} />}
        <ReconciliationBadge status={invoice.reconciliationStatus} />
      </View>
    </Pressable>
  );
}

export function NoteRow({
  note,
  attention = null,
}: {
  note: DeliveryNote;
  /** Set when the note counts in the home badge (BR-INV-16): highlighted with its age. */
  attention?: NoteAttention | null;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/invoices/delivery-note/${note.id}`)}
      style={({ pressed }) => [
        styles.row,
        attention && styles.attention,
        pressed && styles.pressed,
      ]}
      testID={`delivery-note-${note.number}`}
    >
      <Text style={styles.title}>{note.thirdParty.name}</Text>
      <Text style={styles.detail}>
        {t('invoicing.row.noteNumber', { number: note.number })} · {formatDay(note.date)}
      </Text>
      <View style={styles.badges}>
        <Badge
          label={t(`enums.deliveryNoteStatus.${note.status}`)}
          tone={note.status === 'pending_invoicing' ? 'warning' : 'neutral'}
        />
        {attention && (
          <Badge
            label={t('invoicing.attention.noteDays', { count: attention.days })}
            tone={attention.stale ? 'danger' : 'warning'}
          />
        )}
      </View>
    </Pressable>
  );
}

/** Label / value line of a detail screen. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{children}</Text>
    </View>
  );
}

export const listStyles = StyleSheet.create({
  empty: { color: colors.muted, fontSize: 15, padding: 16, textAlign: 'center' },
});

const styles = StyleSheet.create({
  row: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 6 },
  attention: { borderLeftWidth: 4, borderLeftColor: colors.danger },
  pressed: { opacity: 0.7 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text, flexShrink: 1 },
  amount: { fontSize: 16, fontWeight: '600', color: colors.text },
  detail: { fontSize: 13, color: colors.muted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  factLabel: { fontSize: 14, color: colors.muted },
  factValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
});
