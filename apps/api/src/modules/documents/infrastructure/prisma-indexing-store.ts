import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { IndexingStatus } from '../domain/document';
import type {
  IndexingStore,
  PendingVersion,
  VersionToIndex,
} from '../application/ports/indexing-store';

export class PrismaIndexingStore implements IndexingStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findVersion(
    cooperativeId: string,
    documentId: string,
    versionId: string,
  ): Promise<VersionToIndex | null> {
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, documentId, document: { cooperativeId } },
      select: { fileKey: true, isCurrent: true, document: { select: { status: true } } },
    });
    if (!version) return null;
    return {
      fileKey: version.fileKey,
      indexable: version.isCurrent && version.document.status === 'publicado',
    };
  }

  async setStatus(versionId: string, status: IndexingStatus, error: string | null): Promise<void> {
    await this.prisma.documentVersion.update({
      where: { id: versionId },
      data: { indexingStatus: status, indexingError: error },
    });
  }

  async listPending(): Promise<PendingVersion[]> {
    const versions = await this.prisma.documentVersion.findMany({
      where: { isCurrent: true, indexingStatus: 'pendiente', document: { status: 'publicado' } },
      orderBy: { uploadedAt: 'asc' },
      select: { id: true, documentId: true, document: { select: { cooperativeId: true } } },
    });
    return versions.map((version) => ({
      cooperativeId: version.document.cooperativeId,
      documentId: version.documentId,
      versionId: version.id,
    }));
  }
}
