import {
  type AssistantMessage,
  type ConversationDetail,
  type AssistantConversation,
  type ListConversationsResponse,
  rateMessageBodySchema,
  sendMessageBodySchema,
  type SendMessageResponse,
} from '@multicooperativa/contracts';
import { type RequestHandler, Router } from 'express';

import { parseBody } from '../../../../shared/infrastructure/http/validation';
import { getCooperativeContext, requirePermission } from '../../../access';
import * as useCases from '../../application/assistant';
import { ConversationNotFoundError } from '../../application/errors';
import type { ConversationRecord, MessageRecord } from '../../application/ports/conversation-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed id cannot name anything of yours: same answer as a missing one. */
function uuidParam(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new ConversationNotFoundError();
  return value;
}

const toConversation = (record: ConversationRecord): AssistantConversation => ({
  id: record.id,
  title: record.title,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

const toMessage = (record: MessageRecord): AssistantMessage => ({
  id: record.id,
  role: record.role,
  content: record.content,
  citations: record.citations,
  tools: record.tools,
  rating: record.rating,
  createdAt: record.createdAt.toISOString(),
});

/** HTTP adapter of the assistant module (requirements/07, section 8). */
export function createAssistantRouter(
  deps: useCases.AssistantDeps,
  requireCooperative: RequestHandler,
): Router {
  const router = Router();
  const base = '/cooperatives/:cooperativeId/assistant';
  const guard = [requireCooperative, requirePermission('assistant', 'read')];

  router.post(`${base}/conversations`, ...guard, async (_req, res) => {
    const conversation = await useCases.createConversation(deps, getCooperativeContext(res));
    res.status(201).json(toConversation(conversation) satisfies AssistantConversation);
  });

  router.get(`${base}/conversations`, ...guard, async (_req, res) => {
    const conversations = await useCases.listConversations(deps, getCooperativeContext(res));
    res.json({ items: conversations.map(toConversation) } satisfies ListConversationsResponse);
  });

  router.get(`${base}/conversations/:conversationId`, ...guard, async (req, res) => {
    const { conversation, messages } = await useCases.getConversation(
      deps,
      getCooperativeContext(res),
      uuidParam(req.params.conversationId),
    );
    res.json({
      ...toConversation(conversation),
      messages: messages.map(toMessage),
    } satisfies ConversationDetail);
  });

  router.post(`${base}/conversations/:conversationId/messages`, ...guard, async (req, res) => {
    const conversationId = uuidParam(req.params.conversationId);
    const { content } = parseBody(sendMessageBodySchema, req.body);
    const { user, answer } = await useCases.sendMessage(
      deps,
      getCooperativeContext(res),
      conversationId,
      content,
    );
    res.status(201).json({
      userMessage: toMessage(user),
      answer: toMessage(answer),
    } satisfies SendMessageResponse);
  });

  router.post(`${base}/messages/:messageId/rating`, ...guard, async (req, res) => {
    const messageId = uuidParam(req.params.messageId);
    const { rating } = parseBody(rateMessageBodySchema, req.body);
    const message = await useCases.rateMessage(deps, getCooperativeContext(res), messageId, rating);
    res.json(toMessage(message) satisfies AssistantMessage);
  });

  return router;
}
