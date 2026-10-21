import type {
  ConversationRecord,
  ConversationStore,
  MessageRecord,
  NewMessage,
  Rating,
} from '../ports/conversation-store';

/** Test double with the same scoping rules as the Prisma store. */
export class InMemoryConversationStore implements ConversationStore {
  readonly conversations: ConversationRecord[] = [];
  readonly stored: MessageRecord[] = [];
  private next = 1;
  /** Moment given to new rows; tests move it to exercise the hourly window. */
  clock: () => Date = () => new Date();

  private id() {
    return `00000000-0000-4000-8000-${String(this.next++).padStart(12, '0')}`;
  }

  async create(cooperativeId: string, membershipId: string) {
    const now = this.clock();
    const conversation = {
      id: this.id(),
      cooperativeId,
      membershipId,
      title: null,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.push(conversation);
    return conversation;
  }

  async list(cooperativeId: string, membershipId: string, page?: { limit: number; before?: Date }) {
    const mine = this.conversations
      .filter(
        (c) =>
          c.cooperativeId === cooperativeId &&
          c.membershipId === membershipId &&
          c.title !== null &&
          (!page?.before || c.updatedAt < page.before),
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return page ? mine.slice(0, page.limit) : mine;
  }

  async remove(cooperativeId: string, membershipId: string, conversationId: string) {
    if (!(await this.find(cooperativeId, membershipId, conversationId))) return false;
    this.conversations.splice(
      this.conversations.findIndex((c) => c.id === conversationId),
      1,
    );
    for (let i = this.stored.length - 1; i >= 0; i--) {
      if (this.stored[i]!.conversationId === conversationId) this.stored.splice(i, 1);
    }
    return true;
  }

  async find(cooperativeId: string, membershipId: string, conversationId: string) {
    return (
      this.conversations.find(
        (c) =>
          c.id === conversationId &&
          c.cooperativeId === cooperativeId &&
          c.membershipId === membershipId,
      ) ?? null
    );
  }

  async messages(
    cooperativeId: string,
    membershipId: string,
    conversationId: string,
    limit?: number,
  ) {
    if (!(await this.find(cooperativeId, membershipId, conversationId))) return [];
    const all = this.stored.filter((m) => m.conversationId === conversationId);
    return limit ? all.slice(-limit) : all;
  }

  private add(conversationId: string, message: NewMessage): MessageRecord {
    const record = {
      ...message,
      id: this.id(),
      conversationId,
      rating: null,
      createdAt: this.clock(),
    };
    this.stored.push(record);
    return record;
  }

  async appendExchange(
    cooperativeId: string,
    membershipId: string,
    conversationId: string,
    exchange: { user: NewMessage; answer: NewMessage; title: string },
  ) {
    const conversation = await this.find(cooperativeId, membershipId, conversationId);
    if (!conversation) return null;
    const user = this.add(conversationId, exchange.user);
    const answer = this.add(conversationId, exchange.answer);
    conversation.title ??= exchange.title;
    conversation.updatedAt = this.clock();
    return { user, answer };
  }

  async rate(cooperativeId: string, membershipId: string, messageId: string, rating: Rating) {
    const message = this.stored.find((m) => m.id === messageId && m.role === 'assistant');
    if (!message || !(await this.find(cooperativeId, membershipId, message.conversationId))) {
      return null;
    }
    message.rating = rating;
    return message;
  }

  async usageSince(cooperativeId: string, membershipId: string, since: Date) {
    const ids = new Set(
      this.conversations
        .filter((c) => c.cooperativeId === cooperativeId && c.membershipId === membershipId)
        .map((c) => c.id),
    );
    const sent = this.stored
      .filter((m) => m.role === 'user' && ids.has(m.conversationId) && m.createdAt >= since)
      .map((m) => m.createdAt.getTime());
    return { count: sent.length, oldest: sent.length ? new Date(Math.min(...sent)) : null };
  }
}
