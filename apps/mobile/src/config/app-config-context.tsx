import { createContext, type ReactNode, useContext } from 'react';

import type { AppConfig } from './app-config';

const AppConfigContext = createContext<AppConfig | null>(null);

export function AppConfigProvider({
  config,
  children,
}: {
  config: AppConfig;
  children: ReactNode;
}) {
  return <AppConfigContext.Provider value={config}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig(): AppConfig {
  const config = useContext(AppConfigContext);
  if (!config) {
    throw new Error('useAppConfig debe usarse dentro de AppConfigProvider');
  }
  return config;
}
