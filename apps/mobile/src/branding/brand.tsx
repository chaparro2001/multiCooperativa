import { type Branding, brandingSchema } from '@multicooperativa/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useMemo } from 'react';

import { useServices } from '../app-services';
import { cooperativeKey, useActiveCooperative } from '../cooperatives/active-cooperative';
import { colors } from '../ui/theme';

export const brandingKey = (cooperativeId: string) =>
  [...cooperativeKey(cooperativeId), 'branding'] as const;

/** The signed logo link lives an hour: it is requested again well before that. */
const LOGO_REFRESH_MS = 45 * 60 * 1000;

export interface Brand {
  /** The cooperative's primary colour, or the app's default when it has not chosen one (US-ACC-14). */
  primaryColor: string;
  /** Primary colour the administrator saved; null when the cooperative uses the default. */
  configuredColor: string | null;
  logoUrl: string | null;
  /** False until the first answer (or failure) of the API: the navigator waits for it to avoid a colour flash. */
  ready: boolean;
  /** The logo failed to load (expired link): asks for a fresh one. */
  refreshLogo(): void;
}

const DEFAULT_BRAND: Brand = {
  primaryColor: colors.primary,
  configuredColor: null,
  logoUrl: null,
  ready: true,
  refreshLogo: () => undefined,
};

const BrandContext = createContext<Brand>(DEFAULT_BRAND);

/** Branding of the active cooperative: every member reads it; only the administrator changes it. */
export function BrandProvider({ children }: { children: ReactNode }) {
  const { api } = useServices();
  const { cooperativeId } = useActiveCooperative();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: brandingKey(cooperativeId ?? ''),
    enabled: Boolean(cooperativeId),
    refetchInterval: LOGO_REFRESH_MS,
    queryFn: () =>
      api.request(`/cooperatives/${cooperativeId}/branding`, { schema: brandingSchema }),
  });

  const refreshLogo = useCallback(() => {
    if (cooperativeId) queryClient.invalidateQueries({ queryKey: brandingKey(cooperativeId) });
  }, [cooperativeId, queryClient]);

  const value = useMemo<Brand>(() => {
    const data: Branding | undefined = query.data;
    return {
      primaryColor: data?.primaryColor ?? colors.primary,
      configuredColor: data?.primaryColor ?? null,
      logoUrl: data?.logoUrl ?? null,
      ready: !cooperativeId || !query.isPending,
      refreshLogo,
    };
  }, [query.data, query.isPending, cooperativeId, refreshLogo]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
  return useContext(BrandContext);
}

/** The colour to use where the app used `colors.primary`; danger and info colours stay fixed. */
export function useBrandColor(): string {
  return useContext(BrandContext).primaryColor;
}
