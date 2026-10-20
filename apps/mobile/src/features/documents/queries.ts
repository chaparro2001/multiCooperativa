import {
  type DocumentCategory,
  documentDetailSchema,
  documentSummarySchema,
  listDocumentsResponseSchema,
  listDocumentVersionsResponseSchema,
  searchDocumentsResponseSchema,
} from '@multicooperativa/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useServices } from '@/app-services';
import { cooperativeKey, useActiveCooperative } from '@/cooperatives/active-cooperative';
import { appendPdf, type PickedPdf } from '@/features/shared/pdf-upload';

function useScope() {
  const { cooperativeId } = useActiveCooperative();
  if (!cooperativeId) throw new Error('No active cooperative');
  const base = `/cooperatives/${cooperativeId}/documents`;
  const key = [...cooperativeKey(cooperativeId), 'documents'] as const;
  return { base, key };
}

/** US-DOC-02: filtered on the server by title. */
export function useDocumentList(search: string) {
  const { api } = useServices();
  const { base, key } = useScope();
  const q = search.trim();
  return useQuery({
    queryKey: [...key, 'list', q],
    queryFn: () =>
      api.request(q ? `${base}?q=${encodeURIComponent(q)}` : base, {
        schema: listDocumentsResponseSchema,
      }),
  });
}

/** US-DOC-07: by meaning, from 3 characters. */
export function useDocumentSearch(query: string) {
  const { api } = useServices();
  const { base, key } = useScope();
  const q = query.trim();
  return useQuery({
    queryKey: [...key, 'search', q],
    enabled: q.length >= 3,
    queryFn: () =>
      api.request(`${base}/search?q=${encodeURIComponent(q)}`, {
        schema: searchDocumentsResponseSchema,
      }),
  });
}

/** US-DOC-03 and US-DOC-06. The signed link lasts 5 minutes: refetched when opening. */
export function useDocument(id: string) {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'detail', id],
    staleTime: 60_000,
    queryFn: () => api.request(`${base}/${id}`, { schema: documentDetailSchema }),
    // While indexing, poll so the state changes on screen (US-DOC-06).
    refetchInterval: (query) => (query.state.data?.indexingStatus === 'pending' ? 3000 : false),
  });
}

/** Fresh link right before opening the viewer (NFR-DOC-02). */
export function useFreshDocumentUrl() {
  const { api } = useServices();
  const { base } = useScope();
  return (id: string) =>
    api.request(`${base}/${id}`, { schema: documentDetailSchema }).then((detail) => detail.url);
}

export function useDocumentVersions(id: string, enabled: boolean) {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'versions', id],
    enabled,
    queryFn: () =>
      api.request(`${base}/${id}/versions`, { schema: listDocumentVersionsResponseSchema }),
  });
}

function useDocumentMutation<TInput>(run: (input: TInput, base: string) => Promise<unknown>) {
  const queryClient = useQueryClient();
  const { base, key } = useScope();
  return useMutation({
    mutationFn: (input: TInput) => run(input, base),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useUploadDocument() {
  const { api } = useServices();
  return useDocumentMutation(
    (
      input: { title: string; category: DocumentCategory; documentDate: string; pdf: PickedPdf },
      base,
    ) => {
      const form = new FormData();
      form.append('title', input.title);
      form.append('category', input.category);
      form.append('documentDate', input.documentDate);
      appendPdf(form, 'file', input.pdf);
      return api.request(base, { method: 'POST', body: form, schema: documentSummarySchema });
    },
  );
}

export function useAddVersion() {
  const { api } = useServices();
  return useDocumentMutation(({ id, pdf }: { id: string; pdf: PickedPdf }, base) => {
    const form = new FormData();
    appendPdf(form, 'file', pdf);
    return api.request(`${base}/${id}/versions`, {
      method: 'POST',
      body: form,
      schema: documentSummarySchema,
    });
  });
}

export function useDocumentAction() {
  const { api } = useServices();
  return useDocumentMutation(
    ({ id, action }: { id: string; action: 'withdraw' | 'reindex' }, base) =>
      api.request(`${base}/${id}/${action}`, { method: 'POST' }),
  );
}
