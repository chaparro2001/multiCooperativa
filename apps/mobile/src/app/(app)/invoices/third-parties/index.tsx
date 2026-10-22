import type { ThirdParty } from '@multicooperativa/contracts';
import { HeaderAction, HeaderActions } from '@/ui/header-action';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { listStyles } from '@/features/invoicing/components';
import { useThirdParties } from '@/features/invoicing/queries';
import { Segmented } from '@/ui/chip';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { ErrorText, Loading } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { Card, Text, useTheme } from '@/ui/paper';
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
        <Loading />
      ) : list.isError ? (
        <ErrorText>{messageFor(list.error)}</ErrorText>
      ) : (
        <FlatList
          testID="third-party-list"
          data={list.data.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <Text variant="bodyLarge" style={listStyles.empty}>
              {fixed === 'supplier'
                ? t('invoicing.thirdParties.emptySupplier')
                : fixed === 'customer'
                  ? t('invoicing.thirdParties.emptyCustomer')
                  : t('invoicing.thirdParties.empty')}
            </Text>
          }
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

export const PartyRow = memo(function PartyRow({ party }: { party: ThirdParty }) {
  const { t } = useTranslation();
  const onPress = useCallback(() => router.push(`/invoices/third-parties/${party.id}`), [party.id]);
  return (
    <Card
      mode="contained"
      accessibilityRole="button"
      onPress={onPress}
      testID={`third-party-${party.nif}`}
    >
      <Card.Content style={styles.rowContent}>
        <Text variant="titleMedium">{party.name}</Text>
        <Text variant="bodySmall">{party.nif}</Text>
        <View style={styles.badges}>
          {party.isSupplier && <Badge label={t('invoicing.thirdParties.supplier')} tone="info" />}
          {party.isCustomer && <Badge label={t('invoicing.thirdParties.customer')} tone="info" />}
          {!party.active && <Badge label={t('invoicing.thirdParties.inactive')} tone="danger" />}
        </View>
      </Card.Content>
    </Card>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  filters: { padding: 16, paddingBottom: 8, gap: 10 },
  list: { padding: 16, paddingTop: 0, gap: 10 },
  rowContent: { gap: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
