import type { Operation } from '@multicooperativa/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { InvoiceRow, listStyles, NoteRow, useEuros } from '@/features/invoicing/components';
import { useDeliveryNotes, useInvoices, useInvoicingSummary } from '@/features/invoicing/queries';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Button } from '@/ui/button';
import { ErrorText, Loading } from '@/ui/screen';
import { colors } from '@/ui/theme';
import { usePullToRefresh } from '@/ui/use-pull-to-refresh';

import { Segmented } from '@/features/invoicing/segmented';
import { HeaderAction, HeaderActions } from '@/ui/header-action';

type Kind = 'invoice' | 'delivery_note';

/**
 * US-INV-06 and US-INV-07: summary, then purchases and sales with their invoices and delivery notes.
 * The Invoices and Delivery notes home tiles open it fixed to one `kind`; without it, both sections show.
 */
export default function InvoicingHomeScreen() {
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const fixed: Kind | null =
    kindParam === 'invoice' || kindParam === 'delivery_note' ? kindParam : null;
  const { t } = useTranslation();
  const { canManage } = useModuleAccess('invoicing');
  const summary = useInvoicingSummary();
  const [operation, setOperation] = useState<Operation>('purchase');
  const [chosen, setChosen] = useState<'invoices' | 'notes'>('invoices');
  const section = fixed ? (fixed === 'invoice' ? 'invoices' : 'notes') : chosen;
  const invoices = useInvoices(operation);
  const notes = useDeliveryNotes(operation);
  const kind: Kind = fixed ?? (section === 'notes' ? 'delivery_note' : 'invoice');
  const refresh = usePullToRefresh(async () => {
    await Promise.all([summary.refetch(), invoices.refetch(), notes.refetch()]);
  });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl {...refresh} />}
      testID="invoicing-screen"
    >
      <Stack.Screen
        options={{
          ...(fixed && {
            title: t(fixed === 'invoice' ? 'invoicing.home.invoices' : 'invoicing.home.notes'),
          }),
          headerRight: () => (
            <HeaderActions>
              <HeaderAction
                href="/invoices/third-parties"
                title={t('invoicing.home.thirdParties')}
                testID="third-parties-link"
              />
            </HeaderActions>
          ),
        }}
      />
      <SummaryCards kind={fixed} />

      {canManage && (
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              title={t('invoicing.home.scan')}
              onPress={() =>
                router.push({ pathname: '/invoices/capture', params: { operation, kind: kind } })
              }
              testID="scan-document"
            />
          </View>
          <View style={styles.action}>
            <Button
              title={t(
                kind === 'delivery_note'
                  ? 'invoicing.home.registerNote'
                  : 'invoicing.home.registerInvoice',
              )}
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/invoices/register', params: { operation, kind } })
              }
              testID="register-document"
            />
          </View>
        </View>
      )}

      <Segmented<Operation>
        value={operation}
        onChange={setOperation}
        options={(['purchase', 'sale'] as const).map((value) => ({
          value,
          label: t(`enums.operation.${value}`),
        }))}
        testIDPrefix="operation"
      />
      {!fixed && (
        <Segmented<'invoices' | 'notes'>
          value={section}
          onChange={setChosen}
          options={(['invoices', 'notes'] as const).map((value) => ({
            value,
            label: t(`invoicing.home.${value}`),
          }))}
          testIDPrefix="section"
        />
      )}

      {section === 'invoices' ? (
        <List query={invoices} empty={t('invoicing.home.noInvoices')}>
          {(items) => items.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} />)}
        </List>
      ) : (
        <List query={notes} empty={t('invoicing.home.noNotes')}>
          {(items) => items.map((note) => <NoteRow key={note.id} note={note} />)}
        </List>
      )}
    </ScrollView>
  );
}

function List<T>({
  query,
  empty,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; data?: { items: T[] } };
  empty: string;
  children(items: T[]): React.ReactNode;
}) {
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorText>{messageFor(query.error)}</ErrorText>;
  if (!query.data || query.data.items.length === 0) {
    return <Text style={listStyles.empty}>{empty}</Text>;
  }
  return <View style={styles.list}>{children(query.data.items)}</View>;
}

/** US-INV-07: pending and overdue to pay and to collect, plus open discrepancies (US-INV-04) and old delivery notes (US-INV-09). */
function SummaryCards({ kind }: { kind: Kind | null }) {
  const { t } = useTranslation();
  const euros = useEuros();
  const summary = useInvoicingSummary();
  if (summary.isPending) return <Loading />;
  if (summary.isError) return <ErrorText>{messageFor(summary.error)}</ErrorText>;
  const { toPay, toCollect, openDiscrepancies, staleDeliveryNotes } = summary.data;

  const showInvoices = kind !== 'delivery_note';
  const showNotes = kind !== 'invoice';
  if (!showInvoices && staleDeliveryNotes === 0) return null;

  return (
    <View style={styles.summary} testID="summary">
      {showInvoices && (
        <View style={styles.cards}>
          {(
            [
              ['toPay', toPay],
              ['toCollect', toCollect],
            ] as const
          ).map(([key, amounts]) => (
            <View key={key} style={styles.card} testID={`summary-${key}`}>
              <Text style={styles.cardLabel}>{t(`invoicing.summary.${key}`)}</Text>
              <Text style={styles.cardAmount}>{euros(amounts.pending)}</Text>
              <Text style={styles.cardDetail}>
                {t('invoicing.summary.invoices', { count: amounts.pendingCount })}
              </Text>
              <Text style={[styles.cardDetail, amounts.overdueCount > 0 && styles.overdue]}>
                {t('invoicing.summary.overdue', {
                  amount: euros(amounts.overdue),
                  count: amounts.overdueCount,
                })}
              </Text>
            </View>
          ))}
        </View>
      )}
      {showInvoices && openDiscrepancies > 0 && (
        <Text style={styles.alert} testID="summary-discrepancies">
          {t('invoicing.summary.openDiscrepancies', { count: openDiscrepancies })}
        </Text>
      )}
      {showNotes && staleDeliveryNotes > 0 && (
        <Text style={styles.alert} testID="summary-stale">
          {t('invoicing.summary.staleNotes', { count: staleDeliveryNotes })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 14 },
  summary: { gap: 8 },
  cards: { flexDirection: 'row', gap: 10 },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 12, gap: 2 },
  cardLabel: { fontSize: 13, color: colors.muted, fontWeight: '500' },
  cardAmount: { fontSize: 20, fontWeight: '700', color: colors.text },
  cardDetail: { fontSize: 12, color: colors.muted },
  overdue: { color: colors.danger, fontWeight: '600' },
  alert: {
    backgroundColor: '#fff4d6',
    color: '#7a5600',
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
  },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
  list: { gap: 10 },
});
