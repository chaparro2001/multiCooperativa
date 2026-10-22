import {
  assistantMessageSchema,
  assistantModelSettingsSchema,
  conversationDetailSchema,
  type AssistantRating,
  type UpdateAssistantModelBody,
  createConversationResponseSchema,
  listConversationsResponseSchema,
  sendMessageResponseSchema,
} from '@multicooperativa/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useServices } from '@/app-services';
import { ApiError } from '@/api/api-error';
import { cooperativeKey, useActiveCooperative } from '@/cooperatives/active-cooperative';

function useBase() {
  const { cooperativeId } = useActiveCooperative();
  if (!cooperativeId) throw new Error('No active cooperative');
  return `/cooperatives/${cooperativeId}/assistant`;
}

function useHistoryScope() {
  const { cooperativeId } = useActiveCooperative();
  if (!cooperativeId) throw new Error('No active cooperative');
  return {
    base: `/cooperatives/${cooperativeId}/assistant/conversations`,
    key: [...cooperativeKey(cooperativeId), 'assistant-conversations'] as const,
  };
}

/** US-AI-04: my conversations, newest activity first, a page at a time. */
export function useConversationList() {
  const { api } = useServices();
  const { base, key } = useHistoryScope();
  return useInfiniteQuery({
    queryKey: [...key, 'list'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.request(pageParam ? `${base}?before=${encodeURIComponent(pageParam)}` : base, {
        schema: listConversationsResponseSchema,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

/** US-AI-04: reopens a conversation; always read from the server, never from a stale copy. */
export function useConversation(id: string | undefined) {
  const { api } = useServices();
  const { base, key } = useHistoryScope();
  return useQuery({
    queryKey: [...key, 'detail', id],
    enabled: Boolean(id),
    gcTime: 0,
    retry: false,
    queryFn: () => api.request(`${base}/${id}`, { schema: conversationDetailSchema }),
  });
}

/** True while the conversation still exists (it may have been deleted from the history meanwhile). */
export function useConversationExists() {
  const { api } = useServices();
  const { base } = useHistoryScope();
  return useCallback(
    async (id: string) => {
      try {
        await api.request(`${base}/${id}`, { schema: conversationDetailSchema });
        return true;
      } catch (failure) {
        if (failure instanceof ApiError && failure.status === 404) return false;
        return true;
      }
    },
    [api, base],
  );
}

/** US-AI-04, privacy: erases the conversation with its messages. */
export function useDeleteConversation() {
  const { api } = useServices();
  const queryClient = useQueryClient();
  const { base, key } = useHistoryScope();
  return useMutation({
    mutationFn: (id: string) => api.request(`${base}/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** The conversation starts with the first question, so an empty chat creates nothing. */
export function useCreateConversation() {
  const { api } = useServices();
  const base = useBase();
  return useMutation({
    mutationFn: () =>
      api.request(`${base}/conversations`, {
        method: 'POST',
        schema: createConversationResponseSchema,
      }),
  });
}

export function useSendMessage() {
  const { api } = useServices();
  const base = useBase();
  return useMutation({
    mutationFn: ({ conversationId, content }: { conversationId: string; content: string }) =>
      api.request(`${base}/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { content },
        schema: sendMessageResponseSchema,
      }),
  });
}

/** US-AI-05. */
export function useRateMessage() {
  const { api } = useServices();
  const base = useBase();
  return useMutation({
    mutationFn: ({ messageId, rating }: { messageId: string; rating: AssistantRating }) =>
      api.request(`${base}/messages/${messageId}/rating`, {
        method: 'POST',
        body: { rating },
        schema: assistantMessageSchema,
      }),
  });
}

function useModelSettingsScope() {
  const { cooperativeId } = useActiveCooperative();
  if (!cooperativeId) throw new Error('No active cooperative');
  return {
    path: `/cooperatives/${cooperativeId}/settings/assistant-model`,
    key: [...cooperativeKey(cooperativeId), 'assistant-model'] as const,
  };
}

/** US-AI-07: only requested by administrators; the API answers 403 to anyone else. */
export function useAssistantModelSettings() {
  const { api } = useServices();
  const { path, key } = useModelSettingsScope();
  return useQuery({
    queryKey: key,
    queryFn: () => api.request(path, { schema: assistantModelSettingsSchema }),
  });
}

/** A local model (`null` is the server default), back to local, or an external provider with the cooperative's own key. */
export function useUpdateAssistantModel() {
  const { api } = useServices();
  const queryClient = useQueryClient();
  const { path, key } = useModelSettingsScope();
  return useMutation({
    mutationFn: (body: UpdateAssistantModelBody) =>
      api.request(path, { method: 'PUT', body, schema: assistantModelSettingsSchema }),
    onSuccess: (settings) => queryClient.setQueryData(key, settings),
  });
}
