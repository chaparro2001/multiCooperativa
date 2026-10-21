import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { messageFor } from '@/api/api-error';
import {
  CapitalTotal,
  MovementList,
  RecordCard,
  memberAreaStyles as s,
} from '@/features/member-area/components';
import { useMemberMovements } from '@/features/member-area/queries';
import { useModuleAccess } from '@/navigation/use-module-access';
import { Button } from '@/ui/button';
import { ErrorText, Loading, Screen } from '@/ui/screen';

/** US-MEM-04: one partner's record and movements; with manage level, a way to register one (US-MEM-03). */
export default function PartnerStatementScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { canManage } = useModuleAccess('member-area');
  const statement = useMemberMovements(id);

  if (statement.isPending) return <Loading />;
  if (statement.isError) {
    return (
      <Screen>
        <ErrorText>{messageFor(statement.error)}</ErrorText>
      </Screen>
    );
  }
  const { member, capital, movements } = statement.data;
  return (
    <Screen testID="screen-partner-statement">
      <Stack.Screen options={{ title: member.name }} />
      <RecordCard member={member} />
      <CapitalTotal label={t('memberArea.me.capitalTotal')} amount={capital} />
      {canManage && (
        <Button
          title={t('memberArea.register.open')}
          onPress={() => router.push(`/member-area/members/${id}/register`)}
          testID="register-movement"
        />
      )}
      <Text style={s.section}>{t('memberArea.me.movements')}</Text>
      <MovementList movements={movements} />
    </Screen>
  );
}
