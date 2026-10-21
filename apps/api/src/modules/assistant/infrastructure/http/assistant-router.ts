import {
  type AssistantMessage,
  type AssistantModelSettings,
  type ConversationDetail,
  type AssistantConversation,
  type ListConversationsResponse,
  rateMessageBodySchema,
  sendMessageBodySchema,
  updateAssistantModelBodySchema,
  type SendMessageResponse,
} from '@multicooperativa/contracts';
import { type RequestHandler, Router } from 'express';

import { parseBody } from '../../../../shared/infrastructure/http/validation';
import { getCooperativeContext, requirePermission } from '../../../access';
import * as useCases from '../../application/assistant';
import * as modelSettings from '../../application/assistant-model-settings';
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
  settingsDeps: modelSettings.ModelSettingsDeps,
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

  // US-AI-07: the model of the cooperative (local, or its own hosted provider), for its administrators only.
  const settingsPath = '/cooperatives/:cooperativeId/settings/assistant-model';
  const adminGuard = [requireCooperative, requirePermission('users', 'manage')];

  router.get(settingsPath, ...adminGuard, async (_req, res) => {
    const settings = await modelSettings.getAssistantModelSettings(
      settingsDeps,
      getCooperativeContext(res),
    );
    res.json(settings satisfies AssistantModelSettings);
  });

  router.put(settingsPath, ...adminGuard, async (req, res) => {
    const body = parseBody(updateAssistantModelBodySchema, req.body);
    const context = getCooperativeContext(res);
    const settings =
      'model' in body && !('source' in body)
        ? await modelSettings.setAssistantModel(settingsDeps, context, body.model)
        : body.source === 'hosted'
          ? await modelSettings.setHostedProvider(settingsDeps, context, body)
          : await modelSettings.useLocalSource(settingsDeps, context);
    res.json(settings satisfies AssistantModelSettings);
  });

  return router;
}
