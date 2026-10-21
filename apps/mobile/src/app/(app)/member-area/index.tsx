import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { messageFor } from '@/api/api-error';
import { CapitalTotal, MovementList, RecordCard } from '@/features/member-area/components';
import { useMyMovements } from '@/features/member-area/queries';
import {} from '@/features/invoicing/components';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Button } from '@/ui/button';
import { Text, useTheme } from '@/ui/paper';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { HeaderAction, HeaderActions } from '@/ui/header-action';

/** US-MEM-01 and US-MEM-02: my record, my capital and my movements. Read-only for the member. */
export default function MemberAreaScreen() {
  const { t } = useTranslation();
  const { scope } = useModuleAccess('member-area');
  const mine = useMyMovements();
  const { colors } = useTheme();

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
        <Loading />
      ) : mine.isError ? (
        <Screen>
          <ErrorText>{messageFor(mine.error)}</ErrorText>
          <Button title={t('common.actions.retry')} onPress={() => mine.refetch()} />
        </Screen>
      ) : (
        <Screen testID="screen-member-area">
          <Text variant="titleLarge">{t('memberArea.me.record')}</Text>
          <RecordCard member={mine.data.member} />
          <Text variant="titleLarge">{t('memberArea.me.capital')}</Text>
          {mine.data.member.isPartner ? (
            <>
              <CapitalTotal label={t('memberArea.me.capitalTotal')} amount={mine.data.capital} />
              <Text variant="titleLarge">{t('memberArea.me.movements')}</Text>
              <MovementList movements={mine.data.movements} />
            </>
          ) : (
            <Text
              variant="bodyLarge"
              style={{ color: colors.onSurfaceVariant }}
              testID="not-partner"
            >
              {t('memberArea.me.notPartner')}
            </Text>
          )}
        </Screen>
      )}
    </>
  );
}
