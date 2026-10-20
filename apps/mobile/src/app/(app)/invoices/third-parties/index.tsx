import type { ThirdParty } from '@multicooperativa/contracts';
import { Link, router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { listStyles } from '@/features/invoicing/components';
import { useThirdParties } from '@/features/invoicing/queries';
import { Segmented } from '@/features/invoicing/segmented';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { ErrorText, Loading } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';
import { usePullToRefresh } from '@/ui/use-pull-to-refresh';

type Filter = 'all' | 'supplier' | 'customer';

/** US-INV-01: suppliers and customers of the cooperative. */
export default function ThirdPartiesScreen() {
  const { t } = useTranslation();
  const { canManage } = useModuleAccess('invoicing');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const list = useThirdParties(filter === 'all' ? undefined : filter, search);
  const { refreshing, onRefresh } = usePullToRefresh(list.refetch);

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: canManage
            ? () => (
                <Link href="/invoices/third-parties/editor" testID="new-third-party">
                  <Text style={listStyles.headerLink}>{t('invoicing.thirdParties.new')}</Text>
                </Link>
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
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={(['all', 'supplier', 'customer'] as const).map((value) => ({
            value,
            label: t(`invoicing.thirdParties.filter.${value}`),
          }))}
          testIDPrefix="filter"
        />
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
            <Text style={listStyles.empty}>{t('invoicing.thirdParties.empty')}</Text>
          }
          renderItem={({ item }) => <PartyRow party={item} />}
        />
      )}
    </View>
  );
}

export function PartyRow({ party }: { party: ThirdParty }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/invoices/third-parties/${party.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`third-party-${party.nif}`}
    >
      <Text style={styles.name}>{party.name}</Text>
      <Text style={styles.detail}>{party.nif}</Text>
      <View style={styles.badges}>
        {party.isSupplier && <Badge label={t('invoicing.thirdParties.supplier')} tone="info" />}
        {party.isCustomer && <Badge label={t('invoicing.thirdParties.customer')} tone="info" />}
        {!party.active && <Badge label={t('invoicing.thirdParties.inactive')} tone="danger" />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  filters: { padding: 16, paddingBottom: 8, gap: 10 },
  list: { padding: 16, paddingTop: 0, gap: 10 },
  row: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 4 },
  pressed: { opacity: 0.7 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  detail: { fontSize: 13, color: colors.muted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
