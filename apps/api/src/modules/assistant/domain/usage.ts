/** BR-AI-08: messages per user (in a cooperative) and hour. */
export const MESSAGE_LIMIT_PER_HOUR = 30;

const HOUR_MS = 60 * 60 * 1000;

/** Start of the window the limit counts messages in. */
export function usageWindowStart(now: Date): Date {
  return new Date(now.getTime() - HOUR_MS);
}

export function usageExceeded(messagesInWindow: number, limit: number): boolean {
  return messagesInWindow >= limit;
}

const TITLE_LENGTH = 80;

/** The conversation is named after its first question. */
export function conversationTitle(firstMessage: string): string {
  return firstMessage.replace(/\s+/g, ' ').trim().slice(0, TITLE_LENGTH);
}

/** Seconds until the oldest counted message leaves the window and a place frees up. */
export function retryAfterSeconds(oldest: Date | null, now: Date): number {
  if (!oldest) return 1;
  return Math.max(1, Math.ceil((oldest.getTime() + HOUR_MS - now.getTime()) / 1000));
}
