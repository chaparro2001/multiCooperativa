import type { MemberCapital } from '@multicooperativa/contracts';
import { router } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { filterPartners } from '@/features/member-area/capital';
import { CapitalTotal } from '@/features/member-area/components';
import { useMemberCapitals } from '@/features/member-area/queries';
import { Badge } from '@/ui/badge';
import { ListRow } from '@/ui/list-row';
import { useTheme } from '@/ui/paper';
import { SCREEN_MAX_WIDTH } from '@/ui/screen';
import { EmptyState, ErrorState, Skeleton } from '@/ui/states';
import { space } from '@/ui/theme';
import { TextField } from '@/ui/text-field';
import { usePullToRefresh } from '@/ui/use-pull-to-refresh';

/** US-MEM-04: each partner's capital and the cooperative's total, with a search to pick one. */
export default function MemberCapitalsScreen() {
  const { t } = useTranslation();
  const capitals = useMemberCapitals();
  const refresh = usePullToRefresh(() => capitals.refetch());
  const [search, setSearch] = useState('');
  const { colors } = useTheme();
  const renderItem = useCallback(
    ({ item }: { item: MemberCapital }) => <PartnerRow item={item} />,
    [],
  );

  if (capitals.isPending) return <Skeleton variant="list" />;
  if (capitals.isError) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.column}>
          <ErrorState message={messageFor(capitals.error)} onRetry={() => capitals.refetch()} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.column}>
        <View style={styles.header}>
          <CapitalTotal
            label={t('memberArea.members.totalCapital')}
            amount={capitals.data.totalCapital}
            testID="cooperative-capital"
          />
          <TextField
            label={t('memberArea.members.search')}
            value={search}
            onChangeText={setSearch}
            placeholder={t('memberArea.members.searchPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            testID="partner-search"
          />
        </View>
        <FlatList
          testID="partner-list"
          data={filterPartners(capitals.data.items, search)}
          keyExtractor={(item) => item.member.membershipId}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refresh.refreshing} onRefresh={refresh.onRefresh} />
          }
          ListEmptyComponent={
            <EmptyState icon="account-group-outline" message={t('memberArea.members.empty')} />
          }
          renderItem={renderItem}
        />
      </View>
    </View>
  );
}

const PartnerRow = memo(function PartnerRow({ item }: { item: MemberCapital }) {
  const { t } = useTranslation();
  const { member } = item;
  const open = useCallback(
    () => router.push(`/member-area/members/${member.membershipId}`),
    [member.membershipId],
  );
  return (
    <ListRow
      title={member.name}
      meta={t('memberArea.members.partnerNumber', { number: member.partnerNumber ?? '–' })}
      amount={item.capital}
      status={
        member.status !== 'active' ? (
          <Badge
            label={t(`enums.membershipStatus.${member.status}`)}
            tone={member.status === 'suspended' ? 'danger' : 'warning'}
          />
        ) : undefined
      }
      onPress={open}
      testID={`partner-${member.email}`}
    />
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { flex: 1, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  header: { padding: space[4], paddingBottom: space[2], gap: space[3] },
  list: { padding: space[4], paddingTop: 0, gap: space[3] },
});
