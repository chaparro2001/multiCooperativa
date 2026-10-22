import {
  type InviteMemberRequest,
  inviteMemberResponseSchema,
  listMembersResponseSchema,
  listProfilesResponseSchema,
  memberSchema,
  resendInvitationResponseSchema,
  type UpdateMemberRequest,
} from '@multicooperativa/contracts';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { useServices } from '@/app-services';
import { nextCursorOf, pagedPath } from '@/api/paged';
import { cooperativeKey, useActiveCooperative } from '@/cooperatives/active-cooperative';

import type { StatusFilter } from './members';

function useScope() {
  const { cooperativeId } = useActiveCooperative();
  if (!cooperativeId) throw new Error('No active cooperative');
  const base = `/cooperatives/${cooperativeId}`;
  const key = [...cooperativeKey(cooperativeId), 'members'] as const;
  return { base, key };
}

/** US-ACC-10: everyone except removed members, by name, a page at a time; search and status are filtered by the server. */
export function useMembers(filter: { search: string; status: StatusFilter }) {
  const { api } = useServices();
  const { base, key } = useScope();
  const q = filter.search.trim();
  return useInfiniteQuery({
    queryKey: [...key, 'list', q, filter.status],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.request(
        pagedPath(
          `${base}/members`,
          { q, status: filter.status === 'all' ? undefined : filter.status },
          pageParam,
        ),
        { schema: listMembersResponseSchema },
      ),
    getNextPageParam: nextCursorOf,
    placeholderData: keepPreviousData,
  });
}

/** US-ACC-10: one member, for its detail screen. */
export function useMember(id: string) {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'member', id],
    queryFn: () => api.request(`${base}/members/${id}`, { schema: memberSchema }),
  });
}

/** The cooperative's profiles, for the picker (US-ACC-08, US-ACC-09). */
export function useProfiles() {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'profiles'],
    queryFn: async () =>
      (await api.request(`${base}/profiles`, { schema: listProfilesResponseSchema })).profiles,
  });
}

/** US-ACC-08. The membership exists even if the delivery fails (503), so the list refreshes anyway; the response carries the link to pass on (ADR-016). */
export function useInviteMember() {
  const { api } = useServices();
  const queryClient = useQueryClient();
  const { base, key } = useScope();
  return useMutation({
    mutationFn: (input: InviteMemberRequest) =>
      api.request(`${base}/members`, {
        method: 'POST',
        body: input,
        schema: inviteMemberResponseSchema,
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** US-ACC-09 (profile), US-ACC-10 (suspend, reactivate): one change per request. */
export function useChangeMember() {
  const { api } = useServices();
  const queryClient = useQueryClient();
  const { base, key } = useScope();
  return useMutation({
    mutationFn: ({ id, change }: { id: string; change: UpdateMemberRequest }) =>
      api.request(`${base}/members/${id}`, { method: 'PATCH', body: change, schema: memberSchema }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** US-ACC-08: the previous invitation is invalidated and a new one issued. */
export function useResendInvitation() {
  const { api } = useServices();
  const { base } = useScope();
  return useMutation({
    mutationFn: (id: string) =>
      api.request(`${base}/members/${id}/invitation`, {
        method: 'POST',
        schema: resendInvitationResponseSchema,
      }),
  });
}
