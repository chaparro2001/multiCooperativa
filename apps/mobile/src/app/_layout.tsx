import { focusManager, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { ApiError } from '@/api/api-error';
import { createAppServices, ServicesProvider } from '@/app-services';
import { BiometricsProvider } from '@/auth/biometrics';
import { parseAppConfig } from '@/config/app-config';
import { AppConfigProvider } from '@/config/app-config-context';
import { SessionProvider, useSession } from '@/session/session-context';
import { createDeviceStore } from '@/storage/secure-key-value-store';

// Único punto donde la app lee su entorno: el resto recibe la configuración inyectada.
const appConfig = parseAppConfig({ apiUrl: process.env.EXPO_PUBLIC_API_URL });
const services = createAppServices(appConfig.apiUrl, createDeviceStore());

// La pantalla de carga sigue visible hasta saber si hay sesión: nunca se ve una pantalla equivocada.
SplashScreen.preventAutoHideAsync();

// Volver a la app cuenta como «foco»: las consultas se refrescan (HU-ACC-06).
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
        // Un 403/404 dentro de una cooperativa suele significar que cambió el perfil o la
        // membresía: se vuelven a pedir los permisos para ajustar la navegación.
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          client.invalidateQueries({
            predicate: (query) =>
              query.queryKey[0] === 'cooperativa' && query.queryKey[2] === 'permisos',
          });
        }
      },
    }),
    defaultOptions: {
      queries: {
        // Sin sesión o sin permiso no tiene sentido reintentar.
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
        <Stack.Screen name="login" options={{ title: 'Iniciar sesión', headerShown: false }} />
      </Stack.Protected>
      {/* Abierta desde el enlace del correo, con o sin sesión (HU-ACC-01). */}
      <Stack.Screen name="invitacion" options={{ title: 'Activar acceso' }} />
    </Stack>
  );
}
