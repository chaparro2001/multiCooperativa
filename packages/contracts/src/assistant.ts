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

/** Page size of the history: the app asks for more with `nextCursor`. */
export const DEFAULT_CONVERSATIONS_PAGE = 20;

/** GET /cooperatives/{id}/assistant/conversations query. */
export const listConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(DEFAULT_CONVERSATIONS_PAGE),
  /** `nextCursor` of the previous page: only conversations with older activity. */
  before: z.iso.datetime().optional(),
});

/**
 * GET /cooperatives/{id}/assistant/conversations: mine only (BR-AI-07), with at least one
 * exchange, newest activity first (US-AI-04).
 */
export const listConversationsResponseSchema = z.object({
  items: z.array(assistantConversationSchema),
  /** Pass it as `before` for the next page; null on the last one. */
  nextCursor: z.iso.datetime().nullable(),
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

/** Where the assistant's chat runs; the local-model choice only applies to `ollama` (ADR-013, ADR-014). */
export const assistantProviderSchema = z.enum(['gemini', 'ollama']);

export const assistantModelOptionSchema = z.object({
  /** Ollama model id, e.g. `qwen3:8b`. Allowlisted by the server and installed in Ollama. */
  id: z.string().min(1),
});

/** Hosted OpenAI-compatible providers a cooperative can bring its own key to (US-AI-07, ADR-019). */
export const hostedProviderIdSchema = z.enum(['groq', 'mistral', 'nvidia', 'openrouter']);

/** Where the cooperative's questions go: the server's local/default model or a hosted provider. */
export const assistantSourceSchema = z.enum(['local', 'hosted']);

/** A model id typed by the administrator: no whitespace, bounded. */
export const hostedModelIdSchema = z.string().trim().min(1).max(200).regex(/^\S+$/);

export const hostedProviderOptionSchema = z.object({
  id: hostedProviderIdSchema,
  /** Ids the app can suggest; the administrator may type any other. */
  suggestedModels: z.array(z.string().min(1)),
});

/**
 * GET /cooperatives/{id}/settings/assistant-model (US-AI-07).
 * With `gemini` there is no local model to choose: `current` and `default` are null and `options` empty.
 * `hosted` is the saved external provider while `source` is `hosted`; the API key is never returned,
 * only its last characters.
 */
export const assistantModelSettingsSchema = z.object({
  provider: assistantProviderSchema,
  /** The model this cooperative's questions go to now (the saved one, or the default). */
  current: z.string().nullable(),
  /** The server default, used when the cooperative has not chosen. */
  default: z.string().nullable(),
  options: z.array(assistantModelOptionSchema),
  source: assistantSourceSchema,
  /** False when the server has no ASSISTANT_SECRETS_KEY: external providers cannot be used. */
  hostedAvailable: z.boolean(),
  hosted: z
    .object({
      provider: hostedProviderIdSchema,
      model: z.string(),
      keyHint: z.string(),
    })
    .nullable(),
  providers: z.array(hostedProviderOptionSchema),
});

/**
 * PUT /cooperatives/{id}/settings/assistant-model: a local model (`null` goes back to the server
 * default), back to local without choosing, or an external provider with the cooperative's own key.
 * `apiKey` is required the first time or when the provider changes; omitted, the stored key is kept.
 */
export const updateAssistantModelBodySchema = z.union([
  z.strictObject({
    model: z.string().trim().min(1).max(100).nullable(),
  }),
  z.strictObject({ source: z.literal('local') }),
  z.strictObject({
    source: z.literal('hosted'),
    provider: hostedProviderIdSchema,
    model: hostedModelIdSchema,
    apiKey: z.string().trim().min(8).max(500).regex(/^\S+$/).optional(),
  }),
]);

export type AssistantProvider = z.infer<typeof assistantProviderSchema>;
export type HostedProviderId = z.infer<typeof hostedProviderIdSchema>;
export type AssistantSource = z.infer<typeof assistantSourceSchema>;
export type HostedProviderOption = z.infer<typeof hostedProviderOptionSchema>;
export type UpdateAssistantModelBody = z.infer<typeof updateAssistantModelBodySchema>;
export type AssistantModelOption = z.infer<typeof assistantModelOptionSchema>;
export type AssistantModelSettings = z.infer<typeof assistantModelSettingsSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type CitationKind = z.infer<typeof citationKindSchema>;
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export type AssistantRating = z.infer<typeof assistantRatingSchema>;
export type AssistantConversation = z.infer<typeof assistantConversationSchema>;
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
export type ListConversationsResponse = z.infer<typeof listConversationsResponseSchema>;
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;
export type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>;
