import type { MemberCapital } from '@multicooperativa/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { filterPartners } from '@/features/member-area/capital';
import { CapitalTotal } from '@/features/member-area/components';
import { useMemberCapitals } from '@/features/member-area/queries';
import { listStyles, useEuros } from '@/features/invoicing/components';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { ErrorText, Loading, SCREEN_MAX_WIDTH } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';
import { usePullToRefresh } from '@/ui/use-pull-to-refresh';

/** US-MEM-04: each partner's capital and the cooperative's total, with a search to pick one. */
export default function MemberCapitalsScreen() {
  const { t } = useTranslation();
  const capitals = useMemberCapitals();
  const refresh = usePullToRefresh(() => capitals.refetch());
  const [search, setSearch] = useState('');

  if (capitals.isPending) return <Loading />;
  if (capitals.isError) {
    return (
      <View style={styles.screen}>
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
    <View style={styles.screen}>
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
          ListEmptyComponent={<Text style={listStyles.empty}>{t('memberArea.members.empty')}</Text>}
          renderItem={({ item }) => <PartnerRow item={item} />}
        />
      </View>
    </View>
  );
}

function PartnerRow({ item }: { item: MemberCapital }) {
  const { t } = useTranslation();
  const euros = useEuros();
  const { member } = item;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/member-area/members/${member.membershipId}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`partner-${member.email}`}
    >
      <View style={styles.rowText}>
        <Text style={styles.name}>{member.name}</Text>
        <Text style={styles.detail}>
          {t('memberArea.members.partnerNumber', { number: member.partnerNumber ?? '–' })}
        </Text>
        {member.status !== 'active' && (
          <Badge
            label={t(`enums.membershipStatus.${member.status}`)}
            tone={member.status === 'suspended' ? 'danger' : 'warning'}
          />
        )}
      </View>
      <Text style={styles.amount}>{euros(item.capital)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  column: { flex: 1, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  header: { padding: 16, paddingBottom: 8, gap: 12 },
  list: { padding: 16, paddingTop: 0, gap: 10 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
  },
  pressed: { opacity: 0.7 },
  rowText: { flexShrink: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  detail: { fontSize: 13, color: colors.muted },
  amount: { fontSize: 16, fontWeight: '600', color: colors.text },
});
