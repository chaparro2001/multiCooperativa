import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { messageFor } from '@/api/api-error';
import { ActiveCooperativeProvider, useActiveCooperative } from '@/cooperatives/active-cooperative';
import { canAccess, canManage } from '@/navigation/modules';
import { Button } from '@/ui/button';
import { ErrorText, Loading, Screen } from '@/ui/screen';

export default function AppLayout() {
  return (
    <ActiveCooperativeProvider>
      <CooperativeNavigator />
    </ActiveCooperativeProvider>
  );
}

/**
 * US-ACC-06: a module's screen exists only while the profile can read it. The
 * guards hide; the API still answers 403 to anything else.
 */
function CooperativeNavigator() {
  const { t } = useTranslation();
  const { meQuery, cooperativeId, cooperative, permissions } = useActiveCooperative();
  const allowed = permissions?.permissions;

  if (meQuery.isError) {
    return (
      <Screen>
        <ErrorText>{messageFor(meQuery.error)}</ErrorText>
        <Button title={t('common.actions.retry')} onPress={() => meQuery.refetch()} />
      </Screen>
    );
  }
  if (cooperativeId === undefined) return <Loading />;

  const inCooperative = cooperativeId !== null;

  return (
    <Stack screenOptions={{ headerBackTitle: t('common.actions.back') }}>
      <Stack.Protected guard={inCooperative}>
        <Stack.Screen name="index" options={{ title: cooperative?.cooperativeName ?? '' }} />
        <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
        <Stack.Protected guard={canAccess(allowed, 'announcements')}>
          <Stack.Screen
            name="announcements/index"
            options={{ title: t('enums.module.announcements') }}
          />
          <Stack.Screen
            name="announcements/[id]"
            options={{ title: t('announcements.detail.title') }}
          />
          <Stack.Protected guard={canManage(allowed, 'announcements')}>
            <Stack.Screen
              name="announcements/editor"
              options={{ title: t('announcements.detail.title') }}
            />
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Protected guard={canAccess(allowed, 'assemblies')}>
          <Stack.Screen name="assemblies/index" options={{ title: t('enums.module.assemblies') }} />
          <Stack.Screen name="assemblies/[id]" options={{ title: t('assemblies.detail.title') }} />
          <Stack.Screen name="assemblies/vote" options={{ title: t('assemblies.vote.title') }} />
          <Stack.Protected guard={canManage(allowed, 'assemblies')}>
            <Stack.Screen
              name="assemblies/editor"
              options={{ title: t('assemblies.detail.title') }}
            />
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Protected guard={canAccess(allowed, 'documents')}>
          <Stack.Screen name="documents/index" options={{ title: t('enums.module.documents') }} />
          <Stack.Screen name="documents/[id]" options={{ title: t('documents.detail.title') }} />
          <Stack.Protected guard={canManage(allowed, 'documents')}>
            <Stack.Screen
              name="documents/upload"
              options={{ title: t('documents.upload.screenTitle') }}
            />
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Protected guard={canAccess(allowed, 'invoicing')}>
          <Stack.Screen name="invoices/index" options={{ title: t('enums.module.invoicing') }} />
          <Stack.Screen
            name="invoices/invoice/[id]"
            options={{ title: t('invoicing.detail.invoice') }}
          />
          <Stack.Screen
            name="invoices/delivery-note/[id]"
            options={{ title: t('invoicing.detail.deliveryNote') }}
          />
          <Stack.Screen
            name="invoices/third-parties/index"
            options={{ title: t('invoicing.thirdParties.title') }}
          />
          <Stack.Screen
            name="invoices/third-parties/[id]"
            options={{ title: t('invoicing.thirdParties.record') }}
          />
          <Stack.Protected guard={canManage(allowed, 'invoicing')}>
            <Stack.Screen
              name="invoices/third-parties/editor"
              options={{ title: t('invoicing.thirdParties.edit') }}
            />
            <Stack.Screen
              name="invoices/capture"
              options={{ title: t('invoicing.capture.title') }}
            />
            <Stack.Screen name="invoices/register" options={{ title: t('invoicing.form.title') }} />
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Protected guard={canAccess(allowed, 'member-area')}>
          <Stack.Screen name="member-area" options={{ title: t('enums.module.member-area') }} />
        </Stack.Protected>
        <Stack.Protected guard={canAccess(allowed, 'assistant')}>
          <Stack.Screen name="assistant" options={{ title: t('enums.module.assistant') }} />
        </Stack.Protected>
        <Stack.Protected guard={canAccess(allowed, 'users')}>
          <Stack.Screen name="members" options={{ title: t('enums.module.users') }} />
        </Stack.Protected>
      </Stack.Protected>
      <Stack.Screen
        name="select-cooperative"
        options={{ title: t('cooperatives.select.screenTitle') }}
      />
    </Stack>
  );
}
