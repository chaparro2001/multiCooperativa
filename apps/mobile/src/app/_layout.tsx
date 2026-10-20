import { focusManager, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform } from 'react-native';

import { ApiError } from '@/api/api-error';
import { createAppServices, ServicesProvider } from '@/app-services';
import { BiometricsProvider } from '@/auth/biometrics';
import { parseAppConfig } from '@/config/app-config';
import { AppConfigProvider } from '@/config/app-config-context';
import { applyDeviceLanguage } from '@/i18n/device-language';
import { SessionProvider, useSession } from '@/session/session-context';
import { createDeviceStore } from '@/storage/secure-key-value-store';

// The UI language follows the device (Spanish is the default and the fallback).
applyDeviceLanguage();

// The only place where the app reads its environment: the rest gets the configuration injected.
const appConfig = parseAppConfig({ apiUrl: process.env.EXPO_PUBLIC_API_URL });
const services = createAppServices(appConfig.apiUrl, createDeviceStore());

// The splash screen stays visible until it is known whether there is a session: a wrong screen is never shown.
SplashScreen.preventAutoHideAsync();

// Coming back to the app counts as "focus": queries are refreshed (US-ACC-06).
focusManager.setEventListener((setFocused) => {
  if (Platform.OS === 'web') return undefined;
  const subscription = AppState.addEventListener('change', (state) =>
    setFocused(state === 'active'),
  );
  return () => subscription.remove();
});

function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        // A 403/404 inside a cooperative usually means the profile or the membership changed:
        // the permissions are requested again to adjust the navigation.
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          client.invalidateQueries({
            predicate: (query) =>
              query.queryKey[0] === 'cooperative' && query.queryKey[2] === 'permissions',
          });
        }
      },
    }),
    defaultOptions: {
      queries: {
        // Without a session or permission there is no point in retrying.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      },
    },
  });
  return client;
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);

  return (
    <AppConfigProvider config={appConfig}>
      <ServicesProvider services={services}>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <BiometricsProvider>
              <RootNavigator />
            </BiometricsProvider>
          </SessionProvider>
        </QueryClientProvider>
      </ServicesProvider>
    </AppConfigProvider>
  );
}

function RootNavigator() {
  const { t } = useTranslation();
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hide();
  }, [status]);

  if (status === 'loading') return null;

  return (
    <Stack>
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen
          name="login"
          options={{ title: t('auth.login.screenTitle'), headerShown: false }}
        />
      </Stack.Protected>
      {/* Opened from the email link, with or without a session (US-ACC-01). */}
      <Stack.Screen name="invitation" options={{ title: t('auth.invitation.screenTitle') }} />
    </Stack>
  );
}
