import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { messageFor } from '@/api/api-error';
import { useLoadMore } from '@/api/use-load-more';
import { CapitalTotal, MovementsScreen, RecordCard } from '@/features/member-area/components';
import { useMemberMovements } from '@/features/member-area/queries';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Button } from '@/ui/button';
import { Text } from '@/ui/paper';
import { ErrorText, Loading, Screen } from '@/ui/screen';

/** US-MEM-04: one partner's record and movements; with manage level, a way to register one (US-MEM-03). */
export default function PartnerStatementScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { canManage } = useModuleAccess('member-area');
  const statement = useMemberMovements(id);
  const loadMore = useLoadMore(statement);

  if (statement.isPending) return <Loading />;
  if (statement.isError) {
    return (
      <Screen>
        <ErrorText>{messageFor(statement.error)}</ErrorText>
      </Screen>
    );
  }
  const { member, capital } = statement.data.pages[0]!;
  return (
    <>
      <Stack.Screen options={{ title: member.name }} />
      <MovementsScreen
        testID="screen-partner-statement"
        header={
          <>
            <RecordCard member={member} />
            <CapitalTotal label={t('memberArea.me.capitalTotal')} amount={capital} />
            {canManage ? (
              <Button
                title={t('memberArea.register.open')}
                onPress={() => router.push(`/member-area/members/${id}/register`)}
                testID="register-movement"
              />
            ) : null}
            <Text variant="titleLarge">{t('memberArea.me.movements')}</Text>
          </>
        }
        movements={statement.data.pages.flatMap((page) => page.movements)}
        onEndReached={loadMore}
        loadingMore={statement.isFetchingNextPage}
      />
    </>
  );
}
