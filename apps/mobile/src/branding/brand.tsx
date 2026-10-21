import { type Branding, brandingSchema } from '@multicooperativa/contracts';
import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

import { useServices } from '../app-services';
import { cooperativeKey, useActiveCooperative } from '../cooperatives/active-cooperative';
import { colors } from '../ui/theme';

export const brandingKey = (cooperativeId: string) =>
  [...cooperativeKey(cooperativeId), 'branding'] as const;

export interface Brand {
  /** The cooperative's primary colour, or the app's default when it has not chosen one (US-ACC-14). */
  primaryColor: string;
  /** Primary colour the administrator saved; null when the cooperative uses the default. */
  configuredColor: string | null;
  /** False until the first answer (or failure) of the API: the navigator waits for it to avoid a colour flash. */
  ready: boolean;
}

const DEFAULT_BRAND: Brand = {
  primaryColor: colors.primary,
  configuredColor: null,
  ready: true,
};

const BrandContext = createContext<Brand>(DEFAULT_BRAND);

/** Branding of the active cooperative: every member reads it; only the administrator changes it. */
export function BrandProvider({ children }: { children: ReactNode }) {
  const { api } = useServices();
  const { cooperativeId } = useActiveCooperative();

  const query = useQuery({
    queryKey: brandingKey(cooperativeId ?? ''),
    enabled: Boolean(cooperativeId),
    queryFn: () =>
      api.request(`/cooperatives/${cooperativeId}/branding`, { schema: brandingSchema }),
  });

  const value = useMemo<Brand>(() => {
    const data: Branding | undefined = query.data;
    return {
      primaryColor: data?.primaryColor ?? colors.primary,
      configuredColor: data?.primaryColor ?? null,
      ready: !cooperativeId || !query.isPending,
    };
  }, [query.data, query.isPending, cooperativeId]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
  return useContext(BrandContext);
}

/** The colour to use where the app used `colors.primary`; danger and info colours stay fixed. */
export function useBrandColor(): string {
  return useContext(BrandContext).primaryColor;
}
