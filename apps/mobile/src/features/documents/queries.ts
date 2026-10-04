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
  if (!cooperativeId) throw new Error('Sin cooperativa activa');
  const base = `/cooperativas/${cooperativeId}/documentos`;
  const key = [...cooperativeKey(cooperativeId), 'documentos'] as const;
  return { base, key };
}

/** HU-DOC-02: filtered on the server by title. */
export function useDocumentList(search: string) {
  const { api } = useServices();
  const { base, key } = useScope();
  const q = search.trim();
  return useQuery({
    queryKey: [...key, 'lista', q],
    queryFn: () =>
      api.request(q ? `${base}?q=${encodeURIComponent(q)}` : base, {
        schema: listDocumentsResponseSchema,
      }),
  });
}

/** HU-DOC-07: by meaning, from 3 characters. */
export function useDocumentSearch(query: string) {
  const { api } = useServices();
  const { base, key } = useScope();
  const q = query.trim();
  return useQuery({
    queryKey: [...key, 'buscar', q],
    enabled: q.length >= 3,
    queryFn: () =>
      api.request(`${base}/buscar?q=${encodeURIComponent(q)}`, {
        schema: searchDocumentsResponseSchema,
      }),
  });
}

/** HU-DOC-03 and HU-DOC-06. The signed link lasts 5 minutes: refetched when opening. */
export function useDocument(id: string) {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'detalle', id],
    staleTime: 60_000,
    queryFn: () => api.request(`${base}/${id}`, { schema: documentDetailSchema }),
    // While indexing, poll so the state changes on screen (HU-DOC-06).
    refetchInterval: (query) => (query.state.data?.indexingStatus === 'pendiente' ? 3000 : false),
  });
}

/** Fresh link right before opening the viewer (RNF-DOC-02). */
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
    queryKey: [...key, 'versiones', id],
    enabled,
    queryFn: () =>
      api.request(`${base}/${id}/versiones`, { schema: listDocumentVersionsResponseSchema }),
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
      appendPdf(form, 'fichero', input.pdf);
      return api.request(base, { method: 'POST', body: form, schema: documentSummarySchema });
    },
  );
}

export function useAddVersion() {
  const { api } = useServices();
  return useDocumentMutation(({ id, pdf }: { id: string; pdf: PickedPdf }, base) => {
    const form = new FormData();
    appendPdf(form, 'fichero', pdf);
    return api.request(`${base}/${id}/versiones`, {
      method: 'POST',
      body: form,
      schema: documentSummarySchema,
    });
  });
}

export function useDocumentAction() {
  const { api } = useServices();
  return useDocumentMutation(
    ({ id, action }: { id: string; action: 'retirar' | 'reindexar' }, base) =>
      api.request(`${base}/${id}/${action}`, { method: 'POST' }),
  );
}
