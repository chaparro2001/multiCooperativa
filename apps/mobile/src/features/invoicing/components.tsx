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
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { currentLocale, formatDay } from '@/i18n/format';
import { Badge } from '@/ui/badge';
import { colors } from '@/ui/theme';

import { formatEuros } from './amounts';

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

export function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const { t } = useTranslation();
  const euros = useEuros();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/invoices/invoice/${invoice.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
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
        <PaymentBadge status={invoice.paymentStatus} operation={invoice.operation} />
        <ReconciliationBadge status={invoice.reconciliationStatus} />
      </View>
    </Pressable>
  );
}

export function NoteRow({ note }: { note: DeliveryNote }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/invoices/delivery-note/${note.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
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
  // The web header puts headerRight flush against the window edge.
  headerLink: { color: colors.primary, fontSize: 16, marginRight: Platform.OS === 'web' ? 16 : 0 },
});

const styles = StyleSheet.create({
  row: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 6 },
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
