import {
  deliveryNoteDetailSchema,
  type DeliveryNoteInput,
  deliveryNoteSchema,
  extractionResponseSchema,
  type InvoiceInput,
  invoiceDetailSchema,
  invoiceSchema,
  invoicingSummarySchema,
  listDeliveryNotesResponseSchema,
  listInvoicesResponseSchema,
  listThirdPartiesResponseSchema,
  type Operation,
  thirdPartySchema,
  thirdPartySheetSchema,
  type ThirdPartyInput,
  type ThirdPartyUpdate,
} from '@multicooperativa/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useServices } from '@/app-services';
import { cooperativeKey, useActiveCooperative } from '@/cooperatives/active-cooperative';
import { appendScan, type ScanFile } from '@/features/shared/scan-file';

function useScope() {
  const { cooperativeId } = useActiveCooperative();
  if (!cooperativeId) throw new Error('No active cooperative');
  const base = `/cooperatives/${cooperativeId}`;
  const key = [...cooperativeKey(cooperativeId), 'invoicing'] as const;
  return { base, key };
}

/** US-INV-07 and US-INV-09. */
export function useInvoicingSummary() {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'summary'],
    queryFn: () => api.request(`${base}/invoices/summary`, { schema: invoicingSummarySchema }),
  });
}

/** US-INV-06: purchases and sales apart. */
export function useInvoices(operation: Operation) {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'invoices', operation],
    queryFn: () =>
      api.request(`${base}/invoices?operation=${operation}`, {
        schema: listInvoicesResponseSchema,
      }),
  });
}

export function useDeliveryNotes(operation: Operation, options?: { pendingFor?: string }) {
  const { api } = useServices();
  const { base, key } = useScope();
  const extra = options?.pendingFor
    ? `&status=pending_invoicing&thirdParty=${options.pendingFor}`
    : '';
  return useQuery({
    queryKey: [...key, 'delivery-notes', operation, options?.pendingFor ?? 'all'],
    queryFn: () =>
      api.request(`${base}/delivery-notes?operation=${operation}${extra}`, {
        schema: listDeliveryNotesResponseSchema,
      }),
  });
}

/** The signed file link lasts 5 minutes (NFR-INV-02): detail queries are always refetched. */
export function useInvoice(id: string) {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'invoice', id],
    staleTime: 0,
    queryFn: () => api.request(`${base}/invoices/${id}`, { schema: invoiceDetailSchema }),
  });
}

export function useFreshInvoiceUrl() {
  const { api } = useServices();
  const { base } = useScope();
  return (id: string) =>
    api.request(`${base}/invoices/${id}`, { schema: invoiceDetailSchema }).then((d) => d.fileUrl);
}

export function useDeliveryNote(id: string) {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'delivery-note', id],
    staleTime: 0,
    queryFn: () =>
      api.request(`${base}/delivery-notes/${id}`, { schema: deliveryNoteDetailSchema }),
  });
}

export function useFreshDeliveryNoteUrl() {
  const { api } = useServices();
  const { base } = useScope();
  return (id: string) =>
    api
      .request(`${base}/delivery-notes/${id}`, { schema: deliveryNoteDetailSchema })
      .then((d) => d.fileUrl);
}

export function useThirdParties(type?: 'supplier' | 'customer', search = '', inactive = false) {
  const { api } = useServices();
  const { base, key } = useScope();
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (search.trim()) params.set('q', search.trim());
  if (inactive) params.set('inactive', 'true');
  const query = params.toString();
  return useQuery({
    queryKey: [...key, 'third-parties', type ?? 'all', search.trim(), inactive],
    queryFn: () =>
      api.request(`${base}/third-parties${query ? `?${query}` : ''}`, {
        schema: listThirdPartiesResponseSchema,
      }),
  });
}

export function useThirdPartySheet(id: string) {
  const { api } = useServices();
  const { base, key } = useScope();
  return useQuery({
    queryKey: [...key, 'third-party', id],
    queryFn: () => api.request(`${base}/third-parties/${id}`, { schema: thirdPartySheetSchema }),
  });
}

function useInvoicingMutation<TInput, TResult>(
  run: (input: TInput, base: string) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  const { base, key } = useScope();
  return useMutation({
    mutationFn: (input: TInput) => run(input, base),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useCreateThirdParty() {
  const { api } = useServices();
  return useInvoicingMutation((input: ThirdPartyInput, base) =>
    api.request(`${base}/third-parties`, { method: 'POST', body: input, schema: thirdPartySchema }),
  );
}

export function useUpdateThirdParty() {
  const { api } = useServices();
  return useInvoicingMutation(({ id, ...input }: ThirdPartyUpdate & { id: string }, base) =>
    api.request(`${base}/third-parties/${id}`, {
      method: 'PATCH',
      body: input,
      schema: thirdPartySchema,
    }),
  );
}

/** Registers with the record as JSON in `data` and the original in `file` (requirements/05, section 8). */
async function multipart(record: unknown, file: ScanFile | null): Promise<FormData> {
  const form = new FormData();
  form.append('data', JSON.stringify(record));
  if (file) await appendScan(form, 'file', file);
  return form;
}

export function useRegisterDeliveryNote() {
  const { api } = useServices();
  return useInvoicingMutation(
    async ({ record, file }: { record: DeliveryNoteInput; file: ScanFile | null }, base) =>
      api.request(`${base}/delivery-notes`, {
        method: 'POST',
        body: await multipart(record, file),
        schema: deliveryNoteSchema,
      }),
  );
}

export function useRegisterInvoice() {
  const { api } = useServices();
  return useInvoicingMutation(
    async ({ record, file }: { record: InvoiceInput; file: ScanFile | null }, base) =>
      api.request(`${base}/invoices`, {
        method: 'POST',
        body: await multipart(record, file),
        schema: invoiceSchema,
      }),
  );
}

export function useSettleInvoice() {
  const { api } = useServices();
  return useInvoicingMutation(({ id, date }: { id: string; date: string }, base) =>
    api.request(`${base}/invoices/${id}/settle`, {
      method: 'POST',
      body: { date },
      schema: invoiceSchema,
    }),
  );
}

export function useVoidDocument() {
  const { api } = useServices();
  return useInvoicingMutation(
    ({ id, kind }: { id: string; kind: 'invoice' | 'delivery-note' }, base) =>
      api.request(`${base}/${kind === 'invoice' ? 'invoices' : 'delivery-notes'}/${id}/void`, {
        method: 'POST',
      }),
  );
}

/** US-INV-05: the draft is only a proposal; nothing is saved by this call (BR-INV-11). */
export function useExtractDocument() {
  const { api } = useServices();
  const { base } = useScope();
  return useMutation({
    mutationFn: async (file: ScanFile) => {
      const form = new FormData();
      await appendScan(form, 'file', file);
      return api.request(`${base}/extractions`, {
        method: 'POST',
        body: form,
        schema: extractionResponseSchema,
      });
    },
  });
}
