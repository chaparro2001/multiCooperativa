import type { DeliveryNote, Invoice, Operation } from '@multicooperativa/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { allItems } from '@/api/paged';
import { useLoadMore } from '@/api/use-load-more';
import { InvoiceRow, listStyles, NoteRow, useEuros } from '@/features/invoicing/components';
import { todayInSpain } from '@/features/invoicing/attention';
import {
  useDeliveryNotes,
  useInvoices,
  useInvoicingAttention,
  useInvoicingSummary,
} from '@/features/invoicing/queries';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Button } from '@/ui/button';
import { Card, Text, useTheme } from '@/ui/paper';
import { ErrorText, Loading } from '@/ui/screen';
import { colors } from '@/ui/theme';
import { usePullToRefresh } from '@/ui/use-pull-to-refresh';

import { Segmented } from '@/ui/chip';
import { moduleIcon } from '@/navigation/modules';
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
  const { colors: theme } = useTheme();
  const { canManage } = useModuleAccess('invoicing');
  const summary = useInvoicingSummary();
  const [operation, setOperation] = useState<Operation>('purchase');
  const [chosen, setChosen] = useState<'invoices' | 'notes'>('invoices');
  const section = fixed ? (fixed === 'invoice' ? 'invoices' : 'notes') : chosen;
  const invoices = useInvoices(operation);
  const notes = useDeliveryNotes(operation);
  // BR-INV-16: the rows that count in the home badge are highlighted with their reason.
  const attention = useInvoicingAttention();
  const alertSettings = attention.data?.settings;
  const today = todayInSpain();
  const kind: Kind = fixed ?? (section === 'notes' ? 'delivery_note' : 'invoice');
  const { refetch: refetchSummary } = summary;
  const { refetch: refetchInvoices } = invoices;
  const { refetch: refetchNotes } = notes;
  const { refetch: refetchAttention } = attention;
  const refresh = usePullToRefresh(
    useCallback(async () => {
      await Promise.all([refetchSummary(), refetchInvoices(), refetchNotes(), refetchAttention()]);
    }, [refetchSummary, refetchInvoices, refetchNotes, refetchAttention]),
  );

  // One list for the section on screen; the rows are memoized and receive primitives.
  const query = section === 'invoices' ? invoices : notes;
  const items: (Invoice | DeliveryNote)[] = useMemo(
    () => allItems<Invoice | DeliveryNote>(query.data),
    [query.data],
  );
  const loadMore = useLoadMore(query);
  const renderItem = useCallback(
    ({ item }: { item: Invoice | DeliveryNote }) =>
      section === 'invoices' ? (
        <InvoiceRow invoice={item as Invoice} settings={alertSettings} today={today} />
      ) : (
        <NoteRow note={item as DeliveryNote} settings={alertSettings} today={today} />
      ),
    [section, alertSettings, today],
  );

  const header = (
    <View style={styles.header}>
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
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          ...(fixed && {
            title: t(fixed === 'invoice' ? 'invoicing.home.invoices' : 'invoicing.home.notes'),
          }),
          headerRight: () => (
            <HeaderActions>
              <HeaderAction
                href="/invoices/third-parties?type=supplier"
                icon={moduleIcon('suppliers')}
                label={t('invoicing.thirdParties.filter.supplier')}
                testID="suppliers-link"
              />
              <HeaderAction
                href="/invoices/third-parties?type=customer"
                icon={moduleIcon('customers')}
                label={t('invoicing.thirdParties.filter.customer')}
                testID="customers-link"
              />
            </HeaderActions>
          ),
        }}
      />
      <FlatList
        style={[styles.screen, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl {...refresh} />}
        testID="invoicing-screen"
        data={query.isPending || query.isError ? [] : items}
        keyExtractor={keyOf}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={
          query.isPending ? (
            <Loading />
          ) : query.isError ? (
            <ErrorText>{messageFor(query.error)}</ErrorText>
          ) : (
            <Text variant="bodyLarge" style={listStyles.empty}>
              {t(section === 'invoices' ? 'invoicing.home.noInvoices' : 'invoicing.home.noNotes')}
            </Text>
          )
        }
        ListFooterComponent={query.isFetchingNextPage ? <Loading /> : null}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
      />
    </>
  );
}

const keyOf = (item: Invoice | DeliveryNote) => item.id;
const Separator = () => <View style={styles.separator} />;

/** US-INV-07: pending and overdue to pay and to collect, plus open discrepancies (US-INV-04) and old delivery notes (US-INV-09). */
function SummaryCards({ kind }: { kind: Kind | null }) {
  const { t } = useTranslation();
  const euros = useEuros();
  const { colors: theme } = useTheme();
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
            <Card key={key} mode="contained" style={styles.card} testID={`summary-${key}`}>
              <Card.Content style={styles.cardContent}>
                <Text variant="labelLarge" style={{ color: theme.onSurfaceVariant }}>
                  {t(`invoicing.summary.${key}`)}
                </Text>
                <Text variant="headlineSmall" style={styles.cardAmount}>
                  {euros(amounts.pending)}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.onSurfaceVariant }}>
                  {t('invoicing.summary.invoices', { count: amounts.pendingCount })}
                </Text>
                <Text
                  variant="bodySmall"
                  style={
                    amounts.overdueCount > 0 ? styles.overdue : { color: theme.onSurfaceVariant }
                  }
                >
                  {t('invoicing.summary.overdue', {
                    amount: euros(amounts.overdue),
                    count: amounts.overdueCount,
                  })}
                </Text>
              </Card.Content>
            </Card>
          ))}
        </View>
      )}
      {showInvoices && openDiscrepancies > 0 && (
        <Text variant="bodyMedium" style={styles.alert} testID="summary-discrepancies">
          {t('invoicing.summary.openDiscrepancies', { count: openDiscrepancies })}
        </Text>
      )}
      {showNotes && staleDeliveryNotes > 0 && (
        <Text variant="bodyMedium" style={styles.alert} testID="summary-stale">
          {t('invoicing.summary.staleNotes', { count: staleDeliveryNotes })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16 },
  summary: { gap: 8 },
  cards: { flexDirection: 'row', gap: 10 },
  card: { flex: 1 },
  cardContent: { gap: 2 },
  cardAmount: { fontWeight: '700' },
  overdue: { color: colors.danger, fontWeight: '600' },
  alert: {
    backgroundColor: colors.warningContainer,
    color: colors.warning,
    borderRadius: 10,
    padding: 10,
  },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
  header: { gap: 14, marginBottom: 14 },
  separator: { height: 10 },
});
