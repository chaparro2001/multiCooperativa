import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { messageFor } from '@/api/api-error';
import { useLoadMore } from '@/api/use-load-more';
import { CapitalTotal, MovementsScreen, RecordCard } from '@/features/member-area/components';
import { useMyMovements } from '@/features/member-area/queries';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Screen } from '@/ui/screen';
import { SectionTitle } from '@/ui/section-title';
import { EmptyState, ErrorState, Skeleton } from '@/ui/states';
import { HeaderAction, HeaderActions } from '@/ui/header-action';

/** US-MEM-01 and US-MEM-02: my record, my capital and my movements. Read-only for the member. */
export default function MemberAreaScreen() {
  const { t } = useTranslation();
  const { scope } = useModuleAccess('member-area');
  const mine = useMyMovements();
  const loadMore = useLoadMore(mine);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight:
            scope === 'all'
              ? () => (
                  <HeaderActions>
                    <HeaderAction
                      href="/member-area/members"
                      icon="account-group-outline"
                      label={t('memberArea.me.allMembers')}
                      testID="all-members"
                    />
                  </HeaderActions>
                )
              : undefined,
        }}
      />
      {mine.isPending ? (
        <Skeleton variant="detail" />
      ) : mine.isError ? (
        <ErrorState message={messageFor(mine.error)} onRetry={() => mine.refetch()} />
      ) : mine.data.pages[0]!.member.isPartner ? (
        <MovementsScreen
          testID="screen-member-area"
          header={
            <>
              <SectionTitle>{t('memberArea.me.record')}</SectionTitle>
              <RecordCard member={mine.data.pages[0]!.member} />
              <SectionTitle>{t('memberArea.me.capital')}</SectionTitle>
              <CapitalTotal
                label={t('memberArea.me.capitalTotal')}
                amount={mine.data.pages[0]!.capital}
              />
              <SectionTitle>{t('memberArea.me.movements')}</SectionTitle>
            </>
          }
          movements={mine.data.pages.flatMap((page) => page.movements)}
          onEndReached={loadMore}
          loadingMore={mine.isFetchingNextPage}
        />
      ) : (
        <Screen testID="screen-member-area">
          <SectionTitle>{t('memberArea.me.record')}</SectionTitle>
          <RecordCard member={mine.data.pages[0]!.member} />
          <SectionTitle>{t('memberArea.me.capital')}</SectionTitle>
          <EmptyState
            icon="account-cash-outline"
            message={t('memberArea.me.notPartner')}
            testID="not-partner"
          />
        </Screen>
      )}
    </>
  );
}
