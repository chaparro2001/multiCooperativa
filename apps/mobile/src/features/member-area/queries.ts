import {
  listMembersCapitalResponseSchema,
  memberMovementsResponseSchema,
  myMemberAreaResponseSchema,
  type RegisterCapitalMovementRequest,
  registerCapitalMovementResponseSchema,
} from '@multicooperativa/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useServices } from '@/app-services';
import { nextCursorOf, pagedPath } from '@/api/paged';
import { cooperativeKey, useActiveCooperative } from '@/cooperatives/active-cooperative';

function useScope() {
  const { cooperativeId } = useActiveCooperative();
  if (!cooperativeId) throw new Error('No active cooperative');
  const base = `/cooperatives/${cooperativeId}/member-area`;
  const key = [...cooperativeKey(cooperativeId), 'member-area'] as const;
  return { base, key };
}

/** US-MEM-01: my record and my capital. */
export function useMyRecord() {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'me'],
    queryFn: () => api.request(`${base}/me`, { schema: myMemberAreaResponseSchema }),
  });
}

/** US-MEM-02: my movements, newest first, a page at a time; every page carries the whole capital. */
export function useMyMovements() {
  const { api } = useServices();
  const { base, key } = useScope();
  return useInfiniteQuery({
    queryKey: [...key, 'me', 'movements'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.request(pagedPath(`${base}/me/movements`, {}, pageParam), {
        schema: memberMovementsResponseSchema,
      }),
    getNextPageParam: nextCursorOf,
  });
}

/** US-MEM-04: every partner with their capital and the cooperative's total ("all" scope only). */
export function useMemberCapitals() {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'members'],
    queryFn: () => api.request(`${base}/members`, { schema: listMembersCapitalResponseSchema }),
  });
}

/** The movements of one member ("all" scope; the server answers 404 for anyone else's with "own"). */
export function useMemberMovements(membershipId: string) {
  const { api } = useServices();
  const { base, key } = useScope();
  return useInfiniteQuery({
    queryKey: [...key, 'members', membershipId, 'movements'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.request(pagedPath(`${base}/members/${membershipId}/movements`, {}, pageParam), {
        schema: memberMovementsResponseSchema,
      }),
    getNextPageParam: nextCursorOf,
  });
}

/** US-MEM-03: the capitals of the list, the member's statement and my own all change. */
export function useRegisterMovement(membershipId: string) {
  const { api } = useServices();
  const queryClient = useQueryClient();
  const { base, key } = useScope();
  return useMutation({
    mutationFn: (input: RegisterCapitalMovementRequest) =>
      api.request(`${base}/members/${membershipId}/movements`, {
        method: 'POST',
        body: input,
        schema: registerCapitalMovementResponseSchema,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
