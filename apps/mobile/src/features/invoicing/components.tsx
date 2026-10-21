import type {
  DeliveryNote,
  Invoice,
  Operation,
  PaymentStatus,
  ReconciliationStatus,
} from '@multicooperativa/contracts';
import { router } from 'expo-router';
import { type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { currentLocale, formatDay } from '@/i18n/format';
import { Badge } from '@/ui/badge';
import { Card, Text, useTheme } from '@/ui/paper';
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
  const muted = useMutedText();
  return (
    <Card
      mode="contained"
      onPress={() => router.push(`/invoices/invoice/${invoice.id}`)}
      style={attention ? styles.attention : undefined}
      testID={`invoice-${invoice.number}`}
    >
      <Card.Content style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text variant="titleMedium" style={styles.title}>
            {invoice.thirdParty.name}
          </Text>
          <Text variant="titleMedium">{euros(invoice.total)}</Text>
        </View>
        <Text variant="bodySmall" style={muted}>
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
      </Card.Content>
    </Card>
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
  const muted = useMutedText();
  return (
    <Card
      mode="contained"
      onPress={() => router.push(`/invoices/delivery-note/${note.id}`)}
      style={attention ? styles.attention : undefined}
      testID={`delivery-note-${note.number}`}
    >
      <Card.Content style={styles.rowContent}>
        <Text variant="titleMedium">{note.thirdParty.name}</Text>
        <Text variant="bodySmall" style={muted}>
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
      </Card.Content>
    </Card>
  );
}

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

export const listStyles = StyleSheet.create({
  empty: { color: colors.muted, fontSize: 15, padding: 16, textAlign: 'center' },
});

const styles = StyleSheet.create({
  attention: { borderLeftWidth: 4, borderLeftColor: colors.danger },
  rowContent: { gap: 6 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  title: { flexShrink: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  factValue: { fontWeight: '500', flexShrink: 1, textAlign: 'right' },
});
