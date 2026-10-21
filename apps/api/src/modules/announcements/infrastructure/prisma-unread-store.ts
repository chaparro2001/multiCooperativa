import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { UnreadStore } from '../application/ports/unread-store';

export class PrismaUnreadStore implements UnreadStore {
  constructor(private readonly prisma: PrismaClient) {}

  countUnread(cooperativeId: string, membershipId: string): Promise<number> {
    return this.prisma.announcement.count({
      where: {
        cooperativeId,
        status: 'published',
        reads: { none: { membershipId } },
      },
    });
  }
}
