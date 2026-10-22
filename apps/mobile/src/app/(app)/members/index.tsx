import type { Member } from '@multicooperativa/contracts';
import { router, Stack } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { allItems } from '@/api/paged';
import { useLoadMore } from '@/api/use-load-more';
import { STATUS_FILTERS, type StatusFilter, statusTone } from '@/features/members/members';
import { useMembers } from '@/features/members/queries';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Badge } from '@/ui/badge';
import { Chip } from '@/ui/chip';
import { ListRow } from '@/ui/list-row';
import { useTheme } from '@/ui/paper';
import { SCREEN_MAX_WIDTH } from '@/ui/screen';
import { EmptyState, ErrorState, ListFooter, Skeleton } from '@/ui/states';
import { space } from '@/ui/theme';
import { TextField } from '@/ui/text-field';
import { useDebouncedValue } from '@/ui/use-debounced-value';
import { HeaderAction, HeaderActions } from '@/ui/header-action';

/** US-ACC-10: members of the cooperative with their profile and status; invite with manage level. */
export default function MembersScreen() {
  const { t } = useTranslation();
  const { canManage } = useModuleAccess('users');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  // The server filters and pages: the search is sent once the user stops typing.
  const members = useMembers({ search: useDebouncedValue(search), status });
  const { colors } = useTheme();
  const renderItem = useCallback(({ item }: { item: Member }) => <MemberRow member={item} />, []);
  const loadMore = useLoadMore(members);

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
          <View style={styles.filters} accessibilityRole="radiogroup">
            {STATUS_FILTERS.map((value) => (
              <Chip
                key={value}
                selected={status === value}
                onPress={() => setStatus(value)}
                accessibilityLabel={t(`members.filters.${value}`)}
                testID={`filter-${value}`}
              >
                {t(`members.filters.${value}`)}
              </Chip>
            ))}
          </View>
        </View>
        {members.isPending ? (
          <Skeleton variant="list" />
        ) : members.isError ? (
          <ErrorState message={messageFor(members.error)} onRetry={() => members.refetch()} />
        ) : (
          <FlatList
            testID="member-list"
            data={allItems(members.data)}
            keyExtractor={keyOf}
            onEndReachedThreshold={0.4}
            onEndReached={loadMore}
            ListFooterComponent={<ListFooter loading={members.isFetchingNextPage} />}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <EmptyState icon="account-group-outline" message={t('members.list.empty')} />
            }
            renderItem={renderItem}
          />
        )}
      </View>
    </View>
  );
}

const keyOf = (member: Member) => member.membershipId;

const MemberRow = memo(function MemberRow({ member }: { member: Member }) {
  const { t } = useTranslation();
  const open = useCallback(
    () => router.push(`/members/${member.membershipId}`),
    [member.membershipId],
  );
  return (
    <ListRow
      title={member.name}
      meta={member.email}
      status={
        <Badge
          label={t(`enums.membershipStatus.${member.status}`)}
          tone={statusTone(member.status)}
        />
      }
      badges={
        <>
          <Badge label={member.profileName} quiet />
          {member.isPartner ? <Badge label={t('members.fields.isPartner')} quiet /> : null}
        </>
      }
      onPress={open}
      testID={`member-${member.email}`}
    />
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // Same readable column as the Screen component on wide windows.
  column: { flex: 1, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  search: { padding: space[4], paddingBottom: space[2], gap: space[3] },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  list: { padding: space[4], paddingTop: 0, gap: space[3] },
});
