import {
  type Announcement,
  announcementAttachmentSchema,
  announcementDetailSchema,
  announcementSchema,
  type CreateAnnouncementRequest,
  listAnnouncementsResponseSchema,
  type UpdateAnnouncementRequest,
} from '@multicooperativa/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useServices } from '@/app-services';
import { cooperativeKey, useActiveCooperative } from '@/cooperatives/active-cooperative';
import { appendPdf, type PickedPdf } from '@/features/shared/pdf-upload';

function useScope() {
  const { cooperativeId } = useActiveCooperative();
  if (!cooperativeId) throw new Error('Sin cooperativa activa');
  const base = `/cooperativas/${cooperativeId}/comunicados`;
  const key = [...cooperativeKey(cooperativeId), 'comunicados'] as const;
  return { base, key };
}

/** HU-COM-02: pages of 20, loaded as the list scrolls. */
export function useAnnouncementList() {
  const { api } = useServices();
  const { base, key } = useScope();
  return useInfiniteQuery({
    queryKey: [...key, 'lista'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.request(`${base}?offset=${pageParam}`, { schema: listAnnouncementsResponseSchema }),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
  });
}

/** HU-COM-03: opening it marks it as read on the server. */
export function useAnnouncement(id: string | undefined) {
  const { api } = useServices();
  const queryClient = useQueryClient();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'detalle', id],
    // A new announcement in the editor has no id yet: nothing to load.
    enabled: Boolean(id),
    // Attachment links last 5 minutes (RNF-COM-03): refreshed well before.
    staleTime: 60_000,
    queryFn: async () => {
      const detail = await api.request(`${base}/${id}`, { schema: announcementDetailSchema });
      // The list shows it as read from now on.
      queryClient.invalidateQueries({ queryKey: [...key, 'lista'] });
      return detail;
    },
  });
}

/** Every editing action refreshes the list and the detail. */
function useAnnouncementMutation<TInput>(
  run: (input: TInput, base: string) => Promise<Announcement | unknown>,
) {
  const queryClient = useQueryClient();
  const { base, key } = useScope();
  return useMutation({
    mutationFn: (input: TInput) => run(input, base),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useCreateAnnouncement() {
  const { api } = useServices();
  return useAnnouncementMutation((input: CreateAnnouncementRequest, base) =>
    api.request(base, { method: 'POST', body: input, schema: announcementSchema }),
  );
}

export function useUpdateAnnouncement() {
  const { api } = useServices();
  return useAnnouncementMutation(
    ({ id, changes }: { id: string; changes: UpdateAnnouncementRequest }, base) =>
      api.request(`${base}/${id}`, { method: 'PATCH', body: changes, schema: announcementSchema }),
  );
}

export function useAnnouncementAction() {
  const { api } = useServices();
  return useAnnouncementMutation(
    ({ id, action }: { id: string; action: 'publicar' | 'retirar' }, base) =>
      api.request(`${base}/${id}/${action}`, { method: 'POST', schema: announcementSchema }),
  );
}

export function useAddAttachment() {
  const { api } = useServices();
  return useAnnouncementMutation(({ id, pdf }: { id: string; pdf: PickedPdf }, base) => {
    const form = new FormData();
    appendPdf(form, 'fichero', pdf);
    return api.request(`${base}/${id}/adjuntos`, {
      method: 'POST',
      body: form,
      schema: announcementAttachmentSchema,
    });
  });
}
