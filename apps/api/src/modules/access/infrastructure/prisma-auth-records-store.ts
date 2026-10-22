import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { AuthRecordsStore } from '../application/ports/auth-records-store';

export class PrismaAuthRecordsStore implements AuthRecordsStore {
  constructor(private readonly prisma: PrismaClient) {}

  async deleteSessionsEndedBefore(before: Date): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: before } }, { revokedAt: { lt: before } }] },
    });
    return count;
  }

  async deleteFailedAttemptsBefore(before: Date): Promise<number> {
    const { count } = await this.prisma.failedLoginAttempt.deleteMany({
      where: { occurredAt: { lt: before } },
    });
    return count;
  }
}
