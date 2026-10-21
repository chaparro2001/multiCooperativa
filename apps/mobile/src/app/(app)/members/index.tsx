import type { Member } from '@multicooperativa/contracts';
import { router, Stack } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

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
import { Card, SegmentedButtons, Text, useTheme } from '@/ui/paper';
import { ErrorText, Loading } from '@/ui/screen';
import { SCREEN_MAX_WIDTH } from '@/ui/screen';
import { TextField } from '@/ui/text-field';
import { HeaderAction, HeaderActions } from '@/ui/header-action';

/** US-ACC-10: members of the cooperative with their profile and status; invite with manage level. */
export default function MembersScreen() {
  const { t } = useTranslation();
  const { canManage } = useModuleAccess('users');
  const members = useMembers();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const { colors } = useTheme();
  const renderItem = useCallback(({ item }: { item: Member }) => <MemberRow member={item} />, []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerRight: canManage
            ? () => (
                <HeaderActions>
                  <HeaderAction
                    href="/members/invite"
                    icon="account-plus-outline"
                    label={t('members.list.invite')}
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
          <SegmentedButtons
            value={status}
            onValueChange={(value) => setStatus(value as StatusFilter)}
            density="small"
            buttons={STATUS_FILTERS.map((value) => ({
              value,
              label: t(`members.filters.${value}`),
              showSelectedCheck: false,
              accessibilityLabel: t(`members.filters.${value}`),
              testID: `filter-${value}`,
            }))}
          />
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
            ListEmptyComponent={
              <Text variant="bodyLarge" style={[styles.empty, { color: colors.onSurfaceVariant }]}>
                {t('members.list.empty')}
              </Text>
            }
            renderItem={renderItem}
          />
        )}
      </View>
    </View>
  );
}

const MemberRow = memo(function MemberRow({ member }: { member: Member }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card
      mode="contained"
      accessibilityRole="button"
      onPress={() => router.push(`/members/${member.membershipId}`)}
      testID={`member-${member.email}`}
    >
      <Card.Content style={styles.rowContent}>
        <Text variant="titleMedium">{member.name}</Text>
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
          {member.email}
        </Text>
        <View style={styles.meta}>
          <Badge label={member.profileName} />
          {member.isPartner ? <Badge label={t('members.fields.isPartner')} /> : null}
          <Badge
            label={t(`enums.membershipStatus.${member.status}`)}
            tone={statusTone(member.status)}
          />
        </View>
      </Card.Content>
    </Card>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // Same readable column as the Screen component on wide windows.
  column: { flex: 1, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  search: { padding: 16, paddingBottom: 8, gap: 10 },
  list: { padding: 16, paddingTop: 0, gap: 10 },
  empty: { padding: 16, textAlign: 'center' },
  rowContent: { gap: 4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
});
