import { createContext, type ReactNode, useContext } from 'react';

import { type ApiClient, createApiClient } from './api/api-client';
import { type AuthService, createAuthService } from './auth/auth-service';
import { TokenStore } from './auth/token-store';
import type { KeyValueStore } from './storage/key-value-store';

export interface AppServices {
  deviceStore: KeyValueStore;
  api: ApiClient;
  auth: AuthService;
  /** Subscribes to "the session can no longer be renewed"; returns the unsubscribe. */
  onSessionEnded(listener: () => void): () => void;
}

export function createAppServices(apiUrl: string, deviceStore: KeyValueStore): AppServices {
  const listeners = new Set<() => void>();
  const tokens = new TokenStore(deviceStore);
  const api = createApiClient({
    baseUrl: apiUrl,
    tokens,
    onSessionEnded: () => listeners.forEach((listener) => listener()),
  });
  return {
    deviceStore,
    api,
    auth: createAuthService({ api, tokens }),
    onSessionEnded(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const ServicesContext = createContext<AppServices | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside ServicesProvider');
  return services;
}
