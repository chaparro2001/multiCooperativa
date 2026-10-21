import type { Member } from '@multicooperativa/contracts';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import {
  filterMembers,
  STATUS_FILTERS,
  type StatusFilter,
  statusTone,
} from '@/features/members/members';
import { useMembers } from '@/features/members/queries';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { ErrorText, Loading } from '@/ui/screen';
import { SCREEN_MAX_WIDTH } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { colors } from '@/ui/theme';
import { HeaderAction, HeaderActions } from '@/ui/header-action';

/** US-ACC-10: members of the cooperative with their profile and status; invite with manage level. */
export default function MembersScreen() {
  const { t } = useTranslation();
  const { canManage } = useModuleAccess('users');
  const members = useMembers();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: canManage
            ? () => (
                <HeaderActions>
                  <HeaderAction
                    href="/members/invite"
                    title={t('members.list.invite')}
                    testID="invite-member"
                  />
                </HeaderActions>
              )
            : undefined,
        }}
      />
      <View style={styles.column}>
        <View style={styles.search}>
          <TextField
            label={t('members.list.search')}
            value={search}
            onChangeText={setSearch}
            placeholder={t('members.list.searchPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            testID="member-search"
          />
          <View style={styles.filters} accessibilityRole="tablist">
            {STATUS_FILTERS.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: status === value }}
                onPress={() => setStatus(value)}
                style={[styles.filter, status === value && styles.filterSelected]}
                testID={`filter-${value}`}
              >
                <Text style={[styles.filterText, status === value && styles.filterTextSelected]}>
                  {t(`members.filters.${value}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        {members.isPending ? (
          <Loading />
        ) : members.isError ? (
          <View style={styles.list}>
            <ErrorText>{messageFor(members.error)}</ErrorText>
            <Button title={t('common.actions.retry')} onPress={() => members.refetch()} />
          </View>
        ) : (
          <FlatList
            testID="member-list"
            data={filterMembers(members.data, search, status)}
            keyExtractor={(member) => member.membershipId}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>{t('members.list.empty')}</Text>}
            renderItem={({ item }) => <MemberRow member={item} />}
          />
        )}
      </View>
    </View>
  );
}

function MemberRow({ member }: { member: Member }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/members/${member.membershipId}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`member-${member.email}`}
    >
      <Text style={styles.name}>{member.name}</Text>
      <Text style={styles.detail}>{member.email}</Text>
      <View style={styles.meta}>
        <Badge label={member.profileName} />
        {member.isPartner && <Badge label={t('members.fields.isPartner')} />}
        <Badge
          label={t(`enums.membershipStatus.${member.status}`)}
          tone={statusTone(member.status)}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  // Same readable column as the Screen component on wide windows.
  column: { flex: 1, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  search: { padding: 16, paddingBottom: 8, gap: 10 },
  filters: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 10, padding: 3 },
  filter: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  filterSelected: { backgroundColor: '#fff' },
  filterText: { color: colors.muted, fontWeight: '500', fontSize: 13 },
  filterTextSelected: { color: colors.text },
  list: { padding: 16, paddingTop: 0, gap: 10 },
  empty: { color: colors.muted, fontSize: 15, padding: 16, textAlign: 'center' },
  row: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 4 },
  pressed: { opacity: 0.7 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  detail: { fontSize: 14, color: colors.muted },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
});
