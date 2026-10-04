import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { parseAppConfig } from '@/config/app-config';
import { AppConfigProvider } from '@/config/app-config-context';

// Único punto donde la app lee su entorno: el resto recibe la configuración inyectada.
const appConfig = parseAppConfig({ apiUrl: process.env.EXPO_PUBLIC_API_URL });

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <AppConfigProvider config={appConfig}>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ title: 'multiCooperativa' }} />
      </QueryClientProvider>
    </AppConfigProvider>
  );
}
