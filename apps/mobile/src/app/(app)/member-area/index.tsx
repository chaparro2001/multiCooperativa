import { Users } from 'lucide-react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { messageFor } from '@/api/api-error';
import {
  CapitalTotal,
  MovementList,
  RecordCard,
  memberAreaStyles as s,
} from '@/features/member-area/components';
import { useMyMovements } from '@/features/member-area/queries';
import {} from '@/features/invoicing/components';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Button } from '@/ui/button';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { HeaderAction, HeaderActions } from '@/ui/header-action';

/** US-MEM-01 and US-MEM-02: my record, my capital and my movements. Read-only for the member. */
export default function MemberAreaScreen() {
  const { t } = useTranslation();
  const { scope } = useModuleAccess('member-area');
  const mine = useMyMovements();

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
                      icon={Users}
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
          <Text style={s.section}>{t('memberArea.me.record')}</Text>
          <RecordCard member={mine.data.member} />
          <Text style={s.section}>{t('memberArea.me.capital')}</Text>
          {mine.data.member.isPartner ? (
            <>
              <CapitalTotal label={t('memberArea.me.capitalTotal')} amount={mine.data.capital} />
              <Text style={s.section}>{t('memberArea.me.movements')}</Text>
              <MovementList movements={mine.data.movements} />
            </>
          ) : (
            <Text style={s.muted} testID="not-partner">
              {t('memberArea.me.notPartner')}
            </Text>
          )}
        </Screen>
      )}
    </>
  );
}
