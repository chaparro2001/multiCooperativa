import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { SessionStore, StoredSession } from '../application/ports/session-store';

export class PrismaSessionStore implements SessionStore {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: { userId: string; refreshTokenHash: string; expiresAt: Date }) {
    const session = await this.prisma.session.create({ data, select: { id: true } });
    return session.id;
  }

  findById(id: string): Promise<StoredSession | null> {
    return this.prisma.session.findUnique({
      where: { id },
      select: { id: true, userId: true, refreshTokenHash: true, expiresAt: true, revokedAt: true },
    });
  }

  async rotate(
    id: string,
    currentHash: string,
    next: { refreshTokenHash: string; expiresAt: Date },
  ): Promise<boolean> {
    // Conditional update: of two concurrent rotations with the same token, only one wins.
    const { count } = await this.prisma.session.updateMany({
      where: { id, refreshTokenHash: currentHash, revokedAt: null },
      data: next,
    });
    return count === 1;
  }

  async revoke(id: string, at: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: at },
    });
  }
}
