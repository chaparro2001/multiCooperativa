import type { Citation } from '../../domain/citations';

export type MessageRole = 'user' | 'assistant';
export type Rating = 'helpful' | 'not_helpful';

export interface ConversationRecord {
  id: string;
  cooperativeId: string;
  membershipId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  citations: Citation[];
  tools: string[];
  rating: Rating | null;
  createdAt: Date;
}

export interface NewMessage {
  role: MessageRole;
  content: string;
  citations: Citation[];
  tools: string[];
}

/**
 * Every method takes the cooperative and the membership: a conversation is
 * only reachable by its author (BR-AI-07, ADR-003). A miss answers null.
 */
export interface ConversationStore {
  create(cooperativeId: string, membershipId: string): Promise<ConversationRecord>;
  /**
   * Newest activity first, only conversations that already have an exchange (a title).
   * With `before`, only those with older activity.
   */
  list(
    cooperativeId: string,
    membershipId: string,
    page?: { limit: number; before?: Date },
  ): Promise<ConversationRecord[]>;
  find(
    cooperativeId: string,
    membershipId: string,
    conversationId: string,
  ): Promise<ConversationRecord | null>;
  /** Oldest first; with `limit`, the last ones. */
  messages(
    cooperativeId: string,
    membershipId: string,
    conversationId: string,
    limit?: number,
  ): Promise<MessageRecord[]>;
  /** US-AI-04: removes the conversation with its messages and ratings; false when it is not the author's. */
  remove(cooperativeId: string, membershipId: string, conversationId: string): Promise<boolean>;
  /** One step: both messages are stored, the title is set if empty and the activity moves. */
  appendExchange(
    cooperativeId: string,
    membershipId: string,
    conversationId: string,
    exchange: { user: NewMessage; answer: NewMessage; title: string },
  ): Promise<{ user: MessageRecord; answer: MessageRecord } | null>;
  /** Only answers of the author's own conversations. */
  rate(
    cooperativeId: string,
    membershipId: string,
    messageId: string,
    rating: Rating,
  ): Promise<MessageRecord | null>;
  /** BR-AI-08: user messages the membership sent since a moment, and when the oldest was sent. */
  usageSince(
    cooperativeId: string,
    membershipId: string,
    since: Date,
  ): Promise<{ count: number; oldest: Date | null }>;
}
