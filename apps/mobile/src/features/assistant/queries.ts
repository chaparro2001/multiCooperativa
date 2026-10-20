import {
  assistantMessageSchema,
  type AssistantRating,
  createConversationResponseSchema,
  sendMessageResponseSchema,
} from '@multicooperativa/contracts';
import { useMutation } from '@tanstack/react-query';

import { useServices } from '@/app-services';
import { useActiveCooperative } from '@/cooperatives/active-cooperative';

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
