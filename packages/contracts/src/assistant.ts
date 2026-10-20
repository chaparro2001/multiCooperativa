import { z } from 'zod';

/** Kinds of resource an answer can point to (requirements/07, section 9). */
export const citationKindSchema = z.enum([
  'document',
  'invoice',
  'delivery_note',
  'third_party',
  'assembly',
  'announcement',
]);

/**
 * Something the answer is based on. Documents carry the cited chunk (BR-AI-05);
 * the rest are links to the record the assistant read through a tool.
 */
export const citationSchema = z.object({
  /** Marker the model used in the text, e.g. `S1`. */
  ref: z.string(),
  kind: citationKindSchema,
  /** Id of the document, invoice, assembly... the app opens. */
  resourceId: z.uuid(),
  title: z.string(),
  /** Documents only: page and version of the cited chunk. */
  page: z.number().int().min(1).nullable(),
  versionId: z.uuid().nullable(),
  excerpt: z.string().nullable(),
});

export const assistantRoleSchema = z.enum(['user', 'assistant']);
export const assistantRatingSchema = z.enum(['helpful', 'not_helpful']);

export const assistantMessageSchema = z.object({
  id: z.uuid(),
  role: assistantRoleSchema,
  content: z.string(),
  citations: z.array(citationSchema),
  /** Names of the tools used to answer (never their data). */
  tools: z.array(z.string()),
  rating: assistantRatingSchema.nullable(),
  createdAt: z.iso.datetime(),
});

export const assistantConversationSchema = z.object({
  id: z.uuid(),
  title: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** POST /cooperatives/{id}/assistant/conversations */
export const createConversationResponseSchema = assistantConversationSchema;

/** GET /cooperatives/{id}/assistant/conversations: mine only (BR-AI-07). */
export const listConversationsResponseSchema = z.object({
  items: z.array(assistantConversationSchema),
});

/** GET /cooperatives/{id}/assistant/conversations/{conversationId} */
export const conversationDetailSchema = assistantConversationSchema.extend({
  messages: z.array(assistantMessageSchema),
});

/** POST /cooperatives/{id}/assistant/conversations/{conversationId}/messages */
export const sendMessageBodySchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

/** The user's message and the assistant's answer, already persisted. */
export const sendMessageResponseSchema = z.object({
  userMessage: assistantMessageSchema,
  answer: assistantMessageSchema,
});

/** POST /cooperatives/{id}/assistant/messages/{messageId}/rating (US-AI-05). */
export const rateMessageBodySchema = z.object({ rating: assistantRatingSchema });

export type Citation = z.infer<typeof citationSchema>;
export type CitationKind = z.infer<typeof citationKindSchema>;
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export type AssistantRating = z.infer<typeof assistantRatingSchema>;
export type AssistantConversation = z.infer<typeof assistantConversationSchema>;
export type ListConversationsResponse = z.infer<typeof listConversationsResponseSchema>;
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;
export type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>;
