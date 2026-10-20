import {
  type MeResponse,
  meResponseSchema,
  type MyPermissionsResponse,
  myPermissionsResponseSchema,
} from '@multicooperativa/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { ApiError } from '../api/api-error';
import { useServices } from '../app-services';
import { LAST_COOPERATIVE_KEY } from '../session/storage-keys';
import { initialCooperative } from './selection';

/** Every query of a cooperative lives under this key, so switching drops them all. */
export const cooperativeKey = (cooperativeId: string) => ['cooperative', cooperativeId] as const;

interface ActiveCooperativeValue {
  me: MeResponse | undefined;
  meQuery: ReturnType<typeof useQuery<MeResponse>>;
  /** undefined while deciding; null when the user must choose. */
  cooperativeId: string | null | undefined;
  cooperative: MeResponse['memberships'][number] | undefined;
  permissions: MyPermissionsResponse | undefined;
  select(cooperativeId: string): Promise<void>;
}

const ActiveCooperativeContext = createContext<ActiveCooperativeValue | null>(null);

/** US-ACC-05 and US-ACC-06: the cooperative being used and its permissions. */
export function ActiveCooperativeProvider({ children }: { children: ReactNode }) {
  const { api, deviceStore } = useServices();
  const queryClient = useQueryClient();
  const [cooperativeId, setCooperativeId] = useState<string | null | undefined>(undefined);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api.request('/me', { schema: meResponseSchema }),
  });
  const me = meQuery.data;

  useEffect(() => {
    if (!me) return;
    const activeIds = me.memberships.map((membership) => membership.cooperativeId);
    if (cooperativeId === undefined) {
      deviceStore
        .get(LAST_COOPERATIVE_KEY)
        .catch(() => null)
        .then((last) => setCooperativeId(initialCooperative(activeIds, last)));
    } else if (cooperativeId && !activeIds.includes(cooperativeId)) {
      // Suspended or removed meanwhile: back to choosing.
      setCooperativeId(initialCooperative(activeIds, null));
    }
  }, [me, cooperativeId, deviceStore]);

  const permissionsQuery = useQuery({
    queryKey: [...cooperativeKey(cooperativeId ?? ''), 'permissions'],
    enabled: Boolean(cooperativeId),
    // Always fresh: a profile change must show on the next request (US-ACC-06).
    staleTime: 0,
    queryFn: () =>
      api.request(`/cooperatives/${cooperativeId}/me/permissions`, {
        schema: myPermissionsResponseSchema,
      }),
  });

  useEffect(() => {
    const error = permissionsQuery.error;
    if (error instanceof ApiError && error.status === 404) {
      // No longer an active member there.
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setCooperativeId(null);
    }
  }, [permissionsQuery.error, queryClient]);

  const select = useCallback(
    async (id: string) => {
      if (cooperativeId) queryClient.removeQueries({ queryKey: cooperativeKey(cooperativeId) });
      setCooperativeId(id);
      await deviceStore.set(LAST_COOPERATIVE_KEY, id).catch(() => undefined);
    },
    [cooperativeId, deviceStore, queryClient],
  );

  const value = useMemo<ActiveCooperativeValue>(
    () => ({
      me,
      meQuery,
      cooperativeId,
      cooperative: me?.memberships.find((m) => m.cooperativeId === cooperativeId),
      permissions: permissionsQuery.data,
      select,
    }),
    [me, meQuery, cooperativeId, permissionsQuery.data, select],
  );

  return (
    <ActiveCooperativeContext.Provider value={value}>{children}</ActiveCooperativeContext.Provider>
  );
}

export function useActiveCooperative(): ActiveCooperativeValue {
  const value = useContext(ActiveCooperativeContext);
  if (!value) throw new Error('useActiveCooperative must be used inside ActiveCooperativeProvider');
  return value;
}
