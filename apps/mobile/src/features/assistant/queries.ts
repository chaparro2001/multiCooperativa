import {
  assistantMessageSchema,
  assistantModelSettingsSchema,
  type AssistantRating,
  createConversationResponseSchema,
  sendMessageResponseSchema,
} from '@multicooperativa/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useServices } from '@/app-services';
import { cooperativeKey, useActiveCooperative } from '@/cooperatives/active-cooperative';

function useBase() {
  const { cooperativeId } = useActiveCooperative();
  if (!cooperativeId) throw new Error('No active cooperative');
  return `/cooperatives/${cooperativeId}/assistant`;
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

/** `null` goes back to the server default. */
export function useUpdateAssistantModel() {
  const { api } = useServices();
  const queryClient = useQueryClient();
  const { path, key } = useModelSettingsScope();
  return useMutation({
    mutationFn: (model: string | null) =>
      api.request(path, { method: 'PUT', body: { model }, schema: assistantModelSettingsSchema }),
    onSuccess: (settings) => queryClient.setQueryData(key, settings),
  });
}
