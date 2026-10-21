import type { MemberCapital } from '@multicooperativa/contracts';
import { router } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { filterPartners } from '@/features/member-area/capital';
import { CapitalTotal } from '@/features/member-area/components';
import { useMemberCapitals } from '@/features/member-area/queries';
import { listStyles, useEuros } from '@/features/invoicing/components';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card, Text, useTheme } from '@/ui/paper';
import { ErrorText, Loading, SCREEN_MAX_WIDTH } from '@/ui/screen';
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

  if (capitals.isPending) return <Loading />;
  if (capitals.isError) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.column}>
          <View style={styles.list}>
            <ErrorText>{messageFor(capitals.error)}</ErrorText>
            <Button title={t('common.actions.retry')} onPress={() => capitals.refetch()} />
          </View>
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
            <Text
              variant="bodyLarge"
              style={[listStyles.empty, { color: colors.onSurfaceVariant }]}
            >
              {t('memberArea.members.empty')}
            </Text>
          }
          renderItem={renderItem}
        />
      </View>
    </View>
  );
}

const PartnerRow = memo(function PartnerRow({ item }: { item: MemberCapital }) {
  const { t } = useTranslation();
  const euros = useEuros();
  const { colors } = useTheme();
  const { member } = item;
  return (
    <Card
      mode="contained"
      accessibilityRole="button"
      onPress={() => router.push(`/member-area/members/${member.membershipId}`)}
      testID={`partner-${member.email}`}
    >
      <Card.Content style={styles.row}>
        <View style={styles.rowText}>
          <Text variant="titleMedium">{member.name}</Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
            {t('memberArea.members.partnerNumber', { number: member.partnerNumber ?? '–' })}
          </Text>
          {member.status !== 'active' ? (
            <Badge
              label={t(`enums.membershipStatus.${member.status}`)}
              tone={member.status === 'suspended' ? 'danger' : 'warning'}
            />
          ) : null}
        </View>
        <Text variant="titleMedium">{euros(item.capital)}</Text>
      </Card.Content>
    </Card>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { flex: 1, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  header: { padding: 16, paddingBottom: 8, gap: 12 },
  list: { padding: 16, paddingTop: 0, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  rowText: { flexShrink: 1, gap: 4 },
});
