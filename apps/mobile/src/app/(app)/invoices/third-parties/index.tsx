import type { ThirdParty } from '@multicooperativa/contracts';
import { HeaderAction, HeaderActions } from '@/ui/header-action';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { useThirdParties } from '@/features/invoicing/queries';
import { Segmented } from '@/ui/chip';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { SCREEN_PADDING } from '@/ui/screen';
import { EmptyState, ErrorState, Skeleton } from '@/ui/states';
import { ListRow } from '@/ui/list-row';
import { moduleIcon } from '@/navigation/modules';
import { space } from '@/ui/theme';
import { TextField } from '@/ui/text-field';
import { TextInput, useTheme } from '@/ui/paper';
import { usePullToRefresh } from '@/ui/use-pull-to-refresh';

type Filter = 'all' | 'supplier' | 'customer';

/** US-INV-01: suppliers and customers of the cooperative. */
export default function ThirdPartiesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { canManage } = useModuleAccess('invoicing');
  // Opened from the Suppliers or Customers tile: the list is fixed to that type.
  const { type } = useLocalSearchParams<{ type?: string }>();
  const fixed = type === 'supplier' || type === 'customer' ? type : null;
  const [chosen, setFilter] = useState<Filter>('all');
  const filter: Filter = fixed ?? chosen;
  const [search, setSearch] = useState('');
  const list = useThirdParties(filter === 'all' ? undefined : filter, search);
  const { refreshing, onRefresh } = usePullToRefresh(list.refetch);
  const renderItem = useCallback(({ item }: { item: ThirdParty }) => <PartyRow party={item} />, []);

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen
        options={{
          ...(fixed && { title: t(`invoicing.thirdParties.filter.${fixed}`) }),
          headerRight: canManage
            ? () => (
                <HeaderActions>
                  <HeaderAction
                    href={
                      fixed
                        ? `/invoices/third-parties/editor?type=${fixed}`
                        : '/invoices/third-parties/editor'
                    }
                    icon="plus"
                    label={t(
                      fixed === 'supplier'
                        ? 'invoicing.thirdParties.newSupplier'
                        : fixed === 'customer'
                          ? 'invoicing.thirdParties.newCustomer'
                          : 'invoicing.thirdParties.new',
                    )}
                    testID="new-third-party"
                  />
                </HeaderActions>
              )
            : undefined,
        }}
      />
      <View style={styles.filters}>
        <TextField
          label={t('invoicing.thirdParties.search')}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          left={<TextInput.Icon icon="magnify" />}
          testID="third-party-search"
        />
        {!fixed && (
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={(['all', 'supplier', 'customer'] as const).map((value) => ({
              value,
              label: t(`invoicing.thirdParties.filter.${value}`),
            }))}
            testIDPrefix="filter"
          />
        )}
      </View>
      {list.isPending ? (
        <Skeleton />
      ) : list.isError ? (
        <ErrorState message={messageFor(list.error)} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          testID="third-party-list"
          data={list.data.items}
          keyExtractor={keyOf}
          ItemSeparatorComponent={Separator}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <EmptyState
              icon={moduleIcon(fixed === 'customer' ? 'customers' : 'suppliers')}
              message={
                fixed === 'supplier'
                  ? t('invoicing.thirdParties.emptySupplier')
                  : fixed === 'customer'
                    ? t('invoicing.thirdParties.emptyCustomer')
                    : t('invoicing.thirdParties.empty')
              }
            />
          }
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const keyOf = (item: ThirdParty) => item.id;
const Separator = () => <View style={styles.separator} />;

export const PartyRow = memo(function PartyRow({ party }: { party: ThirdParty }) {
  const { t } = useTranslation();
  const onPress = useCallback(() => router.push(`/invoices/third-parties/${party.id}`), [party.id]);
  const badges = [
    party.isSupplier ? (
      <Badge key="supplier" label={t('invoicing.thirdParties.supplier')} tone="info" />
    ) : null,
    party.isCustomer ? (
      <Badge key="customer" label={t('invoicing.thirdParties.customer')} tone="info" />
    ) : null,
    !party.active ? (
      <Badge key="inactive" label={t('invoicing.thirdParties.inactive')} tone="danger" />
    ) : null,
  ];
  return (
    <ListRow
      title={party.name}
      meta={party.nif}
      badges={badges}
      onPress={onPress}
      testID={`third-party-${party.nif}`}
    />
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  filters: { padding: SCREEN_PADDING, paddingBottom: space[2], gap: space[3] },
  list: { padding: SCREEN_PADDING, paddingTop: 0 },
  separator: { height: space[3] },
});
