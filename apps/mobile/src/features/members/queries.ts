import {
  type InviteMemberRequest,
  inviteMemberResponseSchema,
  listMembersResponseSchema,
  listProfilesResponseSchema,
  memberSchema,
  type UpdateMemberRequest,
} from '@multicooperativa/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useServices } from '@/app-services';
import { cooperativeKey, useActiveCooperative } from '@/cooperatives/active-cooperative';

function useScope() {
  const { cooperativeId } = useActiveCooperative();
  if (!cooperativeId) throw new Error('No active cooperative');
  const base = `/cooperatives/${cooperativeId}`;
  const key = [...cooperativeKey(cooperativeId), 'members'] as const;
  return { base, key };
}

/** US-ACC-10: everyone except removed members. */
export function useMembers() {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'list'],
    queryFn: async () =>
      (await api.request(`${base}/members`, { schema: listMembersResponseSchema })).members,
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

/** US-ACC-08. The membership exists even if the delivery fails (503), so the list refreshes anyway. */
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
    mutationFn: (id: string) => api.request(`${base}/members/${id}/invitation`, { method: 'POST' }),
  });
}
