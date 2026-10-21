import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { messageFor } from '@/api/api-error';
import { BrandProvider, useBrand } from '@/branding/brand';
import { BrandPaperProvider } from '@/branding/brand-theme';
import { ActiveCooperativeProvider, useActiveCooperative } from '@/cooperatives/active-cooperative';
import { HeaderBack } from '@/navigation/header-back';
import { allScope, canAccess, canManage } from '@/navigation/modules';
import { Button } from '@/ui/button';
import { ErrorText, Loading, Screen } from '@/ui/screen';
import { useTheme } from '@/ui/paper';

export default function AppLayout() {
  return (
    <ActiveCooperativeProvider>
      <BrandProvider>
        <BrandPaperProvider>
          <CooperativeNavigator />
        </BrandPaperProvider>
      </BrandProvider>
    </ActiveCooperativeProvider>
  );
}

/**
 * US-ACC-06: a module's screen exists only while the profile can read it. The
 * guards hide; the API still answers 403 to anything else.
 */
function CooperativeNavigator() {
  const { t } = useTranslation();
  const { meQuery, permissionsQuery, cooperativeId, cooperative, permissions } =
    useActiveCooperative();
  const brand = useBrand();
  const { colors } = useTheme();
  const allowed = permissions?.permissions;

  const failed = meQuery.isError ? meQuery : permissionsQuery.isError ? permissionsQuery : null;
  if (failed) {
    return (
      <Screen>
        <ErrorText>{messageFor(failed.error)}</ErrorText>
        <Button title={t('common.actions.retry')} onPress={() => failed.refetch()} />
      </Screen>
    );
  }
  if (cooperativeId === undefined) return <Loading />;

  const inCooperative = cooperativeId !== null;
  // Until the permissions arrive the guards below would hide every module and a reloaded deep link
  // would be lost (redirected to the home).
  // The brand colour is awaited too, so the app does not flash the default colour first.
  if (inCooperative && (permissions === undefined || !brand.ready)) return <Loading />;

  return (
    <Stack
      screenOptions={({ navigation }) => ({
        contentStyle: { backgroundColor: colors.background },
        headerBackTitle: t('common.actions.back'),
        // US-ACC-14: back arrow and header links follow the cooperative's colour; titles stay neutral.
        headerTintColor: brand.primaryColor,
        headerTitleStyle: { color: colors.onSurface },
        // Without history (reload, deep link) the default arrow is dead: go to the logical parent.
        ...(navigation.canGoBack() ? {} : { headerLeft: () => <HeaderBack /> }),
      })}
    >
      <Stack.Protected guard={inCooperative}>
        <Stack.Screen
          name="index"
          options={{
            title: cooperative?.cooperativeName ?? '',
            // No back button on the home: a spacer gives the title the standard header inset.
            headerLeft: () => <View style={{ width: 4 }} />,
          }}
        />
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
            <Stack.Screen
              name="assemblies/reschedule"
              options={{ title: t('assemblies.reschedule.title') }}
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
          <Stack.Screen
            name="member-area/index"
            options={{ title: t('enums.module.member-area') }}
          />
          <Stack.Protected guard={allScope(allowed, 'member-area')}>
            <Stack.Screen
              name="member-area/members/index"
              options={{ title: t('memberArea.members.title') }}
            />
            <Stack.Screen
              name="member-area/members/[id]/index"
              options={{ title: t('memberArea.statement.title') }}
            />
            <Stack.Protected guard={canManage(allowed, 'member-area')}>
              <Stack.Screen
                name="member-area/members/[id]/register"
                options={{ title: t('memberArea.register.title') }}
              />
            </Stack.Protected>
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Protected guard={canAccess(allowed, 'assistant')}>
          <Stack.Screen name="assistant/index" options={{ title: t('enums.module.assistant') }} />
          <Stack.Screen
            name="assistant/history"
            options={{ title: t('assistant.history.title') }}
          />
        </Stack.Protected>
        <Stack.Protected guard={canAccess(allowed, 'users')}>
          <Stack.Screen name="members/index" options={{ title: t('enums.module.users') }} />
          <Stack.Screen name="members/[id]" options={{ title: t('members.detail.title') }} />
          <Stack.Protected guard={canManage(allowed, 'users')}>
            <Stack.Screen name="members/invite" options={{ title: t('members.invite.title') }} />
          </Stack.Protected>
        </Stack.Protected>
      </Stack.Protected>
      <Stack.Screen
        name="select-cooperative"
        options={{ title: t('cooperatives.select.screenTitle') }}
      />
    </Stack>
  );
}
