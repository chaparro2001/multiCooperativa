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
  if (!cooperativeId) throw new Error('Sin cooperativa activa');
  return {
    base: `/cooperativas/${cooperativeId}/asambleas`,
    points: `/cooperativas/${cooperativeId}/puntos`,
    key: [...cooperativeKey(cooperativeId), 'asambleas'] as const,
  };
}

/** HU-ASA-03. */
export function useAssemblyList() {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'lista'],
    queryFn: () => api.request(base, { schema: listAssembliesResponseSchema }),
  });
}

/** HU-ASA-03 and HU-ASA-06. While a voting is open, participation is refreshed on screen. */
export function useAssembly(id: string | undefined) {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'detalle', id],
    enabled: Boolean(id),
    queryFn: () => api.request(`${base}/${id}`, { schema: assemblyDetailSchema }),
    refetchInterval: (query) =>
      query.state.data?.points.some((point) => point.voting?.status === 'abierta') ? 5000 : false,
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

/** Creates the draft, or replaces it whole when editing (HU-ASA-01). */
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
    ({ id, action }: { id: string; action: 'convocar' | 'cancelar' | 'cerrar' }) =>
      api.request(`${base}/${id}/${action}`, { method: 'POST', schema: assemblySummarySchema }),
  );
}

/** HU-ASA-04. */
export function useVotingControl() {
  const { api } = useServices();
  const { points } = useScope();
  return useAssemblyMutation(
    ({ pointId, action }: { pointId: string; action: 'abrir' | 'cerrar' }) =>
      api.request(`${points}/${pointId}/votacion/${action}`, {
        method: 'POST',
        schema: votingViewSchema,
      }),
  );
}

/** HU-ASA-05. */
export function useCastVote() {
  const { api } = useServices();
  const { points } = useScope();
  return useAssemblyMutation(({ pointId, choice }: { pointId: string; choice: VoteChoice }) =>
    api.request(`${points}/${pointId}/votacion/votos`, {
      method: 'POST',
      body: { choice },
      schema: votingViewSchema,
    }),
  );
}

/** HU-ASA-02. */
export function useAddPointDocument() {
  const { api } = useServices();
  const { points } = useScope();
  return useAssemblyMutation(({ pointId, pdf }: { pointId: string; pdf: PickedPdf }) => {
    const form = new FormData();
    appendPdf(form, 'fichero', pdf);
    return api.request(`${points}/${pointId}/documentos`, {
      method: 'POST',
      body: form,
      schema: pointAttachmentSchema,
    });
  });
}
