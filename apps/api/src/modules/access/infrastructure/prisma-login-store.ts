import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { LoginStore, UserCredentials } from '../application/ports/login-store';

/** Platform-level: logging in happens before any cooperative is chosen. */
export class PrismaLoginStore implements LoginStore {
  constructor(private readonly prisma: PrismaClient) {}

  findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });
  }

  countActiveMemberships(userId: string): Promise<number> {
    return this.prisma.membership.count({ where: { userId, status: 'active' } });
  }

  async failedAttemptsSince(email: string, since: Date): Promise<Date[]> {
    const attempts = await this.prisma.failedLoginAttempt.findMany({
      where: { email, occurredAt: { gte: since } },
      select: { occurredAt: true },
    });
    return attempts.map((attempt) => attempt.occurredAt);
  }

  async recordFailedAttempt(email: string, at: Date): Promise<void> {
    await this.prisma.failedLoginAttempt.create({ data: { email, occurredAt: at } });
  }

  async clearFailedAttempts(email: string): Promise<void> {
    await this.prisma.failedLoginAttempt.deleteMany({ where: { email } });
  }
}
