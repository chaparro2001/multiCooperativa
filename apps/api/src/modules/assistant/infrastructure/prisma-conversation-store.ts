import { z } from 'zod';

import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type {
  ConversationRecord,
  ConversationStore,
  MessageRecord,
  NewMessage,
  Rating,
} from '../application/ports/conversation-store';

const citationsSchema = z.array(
  z.object({
    ref: z.string(),
    kind: z.enum([
      'document',
      'invoice',
      'delivery_note',
      'third_party',
      'assembly',
      'announcement',
    ]),
    resourceId: z.string(),
    title: z.string(),
    page: z.number().nullable(),
    versionId: z.string().nullable(),
    excerpt: z.string().nullable(),
  }),
);
const toolsSchema = z.array(z.string());

interface MessageRow {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  citations: unknown;
  tools: unknown;
  rating: Rating | null;
  createdAt: Date;
}

const toMessage = (row: MessageRow): MessageRecord => ({
  id: row.id,
  conversationId: row.conversationId,
  role: row.role,
  content: row.content,
  citations: citationsSchema.parse(row.citations),
  tools: toolsSchema.parse(row.tools),
  rating: row.rating,
  createdAt: row.createdAt,
});

const conversationSelect = {
  id: true,
  cooperativeId: true,
  membershipId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Every query carries the cooperative and the membership: only the author reaches a conversation (BR-AI-07). */
export class PrismaConversationStore implements ConversationStore {
  constructor(private readonly prisma: PrismaClient) {}

  create(cooperativeId: string, membershipId: string): Promise<ConversationRecord> {
    return this.prisma.assistantConversation.create({
      data: { cooperativeId, membershipId },
      select: conversationSelect,
    });
  }

  list(cooperativeId: string, membershipId: string): Promise<ConversationRecord[]> {
    return this.prisma.assistantConversation.findMany({
      where: { cooperativeId, membershipId },
      orderBy: { updatedAt: 'desc' },
      select: conversationSelect,
    });
  }

  find(
    cooperativeId: string,
    membershipId: string,
    conversationId: string,
  ): Promise<ConversationRecord | null> {
    return this.prisma.assistantConversation.findFirst({
      where: { id: conversationId, cooperativeId, membershipId },
      select: conversationSelect,
    });
  }

  async messages(
    cooperativeId: string,
    membershipId: string,
    conversationId: string,
    limit?: number,
  ): Promise<MessageRecord[]> {
    const rows = await this.prisma.assistantMessage.findMany({
      where: { conversationId, conversation: { cooperativeId, membershipId } },
      // The last `limit` messages, put back in chronological order below.
      orderBy: { createdAt: limit ? 'desc' : 'asc' },
      take: limit,
    });
    return (limit ? rows.reverse() : rows).map(toMessage);
  }

  async appendExchange(
    cooperativeId: string,
    membershipId: string,
    conversationId: string,
    exchange: { user: NewMessage; answer: NewMessage; title: string },
  ): Promise<{ user: MessageRecord; answer: MessageRecord } | null> {
    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.assistantConversation.findFirst({
        where: { id: conversationId, cooperativeId, membershipId },
        select: { id: true, title: true },
      });
      if (!conversation) return null;
      const now = Date.now();
      const create = (message: NewMessage, createdAt: Date) =>
        tx.assistantMessage.create({
          data: {
            conversationId,
            role: message.role,
            content: message.content,
            citations: message.citations as unknown as object,
            tools: message.tools,
            createdAt,
          },
        });
      // One millisecond apart, so the order of the pair is never ambiguous.
      const user = await create(exchange.user, new Date(now));
      const answer = await create(exchange.answer, new Date(now + 1));
      await tx.assistantConversation.update({
        where: { id: conversationId },
        data: { title: conversation.title ?? exchange.title, updatedAt: new Date() },
      });
      return { user: toMessage(user), answer: toMessage(answer) };
    });
  }

  async rate(
    cooperativeId: string,
    membershipId: string,
    messageId: string,
    rating: Rating,
  ): Promise<MessageRecord | null> {
    const message = await this.prisma.assistantMessage.findFirst({
      where: {
        id: messageId,
        role: 'assistant',
        conversation: { cooperativeId, membershipId },
      },
      select: { id: true },
    });
    if (!message) return null;
    return toMessage(
      await this.prisma.assistantMessage.update({ where: { id: message.id }, data: { rating } }),
    );
  }

  async usageSince(
    cooperativeId: string,
    membershipId: string,
    since: Date,
  ): Promise<{ count: number; oldest: Date | null }> {
    const aggregate = await this.prisma.assistantMessage.aggregate({
      where: {
        role: 'user',
        createdAt: { gte: since },
        conversation: { cooperativeId, membershipId },
      },
      _count: true,
      _min: { createdAt: true },
    });
    return { count: aggregate._count, oldest: aggregate._min.createdAt };
  }
}
