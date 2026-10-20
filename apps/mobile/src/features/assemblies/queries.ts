import {
  assemblyDetailSchema,
  type AssemblyInput,
  assemblySummarySchema,
  listAssembliesResponseSchema,
  pointAttachmentSchema,
  type VoteChoice,
  votingViewSchema,
} from '@multicooperativa/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useServices } from '@/app-services';
import { cooperativeKey, useActiveCooperative } from '@/cooperatives/active-cooperative';
import { appendPdf, type PickedPdf } from '@/features/shared/pdf-upload';

function useScope() {
  const { cooperativeId } = useActiveCooperative();
  if (!cooperativeId) throw new Error('No active cooperative');
  return {
    base: `/cooperatives/${cooperativeId}/assemblies`,
    points: `/cooperatives/${cooperativeId}/points`,
    key: [...cooperativeKey(cooperativeId), 'assemblies'] as const,
  };
}

/** US-ASM-03. */
export function useAssemblyList() {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'list'],
    queryFn: () => api.request(base, { schema: listAssembliesResponseSchema }),
  });
}

/** US-ASM-03 and US-ASM-06. While a voting is open, participation is refreshed on screen. */
export function useAssembly(id: string | undefined) {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'detail', id],
    enabled: Boolean(id),
    queryFn: () => api.request(`${base}/${id}`, { schema: assemblyDetailSchema }),
    refetchInterval: (query) =>
      query.state.data?.points.some((point) => point.voting?.status === 'open') ? 5000 : false,
  });
}

function useAssemblyMutation<TInput, TResult>(run: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  const { key } = useScope();
  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Creates the draft, or replaces it whole when editing (US-ASM-01). */
export function useSaveAssembly() {
  const { api } = useServices();
  const { base } = useScope();
  return useAssemblyMutation(({ id, input }: { id?: string; input: AssemblyInput }) =>
    api.request(id ? `${base}/${id}` : base, {
      method: id ? 'PATCH' : 'POST',
      body: input,
      schema: assemblySummarySchema,
    }),
  );
}

export function useAssemblyAction() {
  const { api } = useServices();
  const { base } = useScope();
  return useAssemblyMutation(
    ({ id, action }: { id: string; action: 'convene' | 'cancel' | 'close' }) =>
      api.request(`${base}/${id}/${action}`, { method: 'POST', schema: assemblySummarySchema }),
  );
}

/** US-ASM-04. */
export function useVotingControl() {
  const { api } = useServices();
  const { points } = useScope();
  return useAssemblyMutation(({ pointId, action }: { pointId: string; action: 'open' | 'close' }) =>
    api.request(`${points}/${pointId}/voting/${action}`, {
      method: 'POST',
      schema: votingViewSchema,
    }),
  );
}

/** US-ASM-05. */
export function useCastVote() {
  const { api } = useServices();
  const { points } = useScope();
  return useAssemblyMutation(({ pointId, choice }: { pointId: string; choice: VoteChoice }) =>
    api.request(`${points}/${pointId}/voting/votes`, {
      method: 'POST',
      body: { choice },
      schema: votingViewSchema,
    }),
  );
}

/** US-ASM-02. */
export function useAddPointDocument() {
  const { api } = useServices();
  const { points } = useScope();
  return useAssemblyMutation(({ pointId, pdf }: { pointId: string; pdf: PickedPdf }) => {
    const form = new FormData();
    appendPdf(form, 'file', pdf);
    return api.request(`${points}/${pointId}/documents`, {
      method: 'POST',
      body: form,
      schema: pointAttachmentSchema,
    });
  });
}
