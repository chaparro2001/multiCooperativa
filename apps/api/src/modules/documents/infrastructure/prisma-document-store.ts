import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { DocumentCategory, DocumentState } from '../domain/document';
import type {
  DocumentRecord,
  DocumentStore,
  DocumentWithCurrent,
  NewVersion,
  VersionRecord,
} from '../application/ports/document-store';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const versionSelect = {
  id: true,
  fileKey: true,
  fileName: true,
  size: true,
  isCurrent: true,
  indexingStatus: true,
  indexingError: true,
  uploadedByMembershipId: true,
  uploadedAt: true,
} as const;

const documentSelect = {
  id: true,
  cooperativeId: true,
  title: true,
  category: true,
  documentDate: true,
  status: true,
  createdAt: true,
} as const;

const withCurrentSelect = {
  ...documentSelect,
  versions: { where: { isCurrent: true }, select: versionSelect },
} as const;

type DocumentRow = Omit<DocumentRecord, 'documentDate'> & { documentDate: Date };

/** `@db.Date` comes back as UTC midnight; the domain uses the calendar day. */
const toDay = (date: Date) => date.toISOString().slice(0, 10);
const fromDay = (day: string) => new Date(`${day}T00:00:00Z`);

function toRecord(row: DocumentRow): DocumentRecord {
  return { ...row, documentDate: toDay(row.documentDate) };
}

function toWithCurrent(row: DocumentRow & { versions: VersionRecord[] }): DocumentWithCurrent {
  const { versions, ...document } = row;
  const current = versions[0];
  if (!current) throw new Error(`El documento ${row.id} no tiene versión vigente (RN-DOC-03).`);
  return { ...toRecord(document), current };
}

const toData = (state: DocumentState) => ({
  title: state.title,
  category: state.category,
  documentDate: fromDay(state.documentDate),
  status: state.status,
});

export class PrismaDocumentStore implements DocumentStore {
  constructor(private readonly prisma: PrismaClient) {}

  async list(
    cooperativeId: string,
    query: { onlyPublished: boolean; category?: DocumentCategory; search?: string },
  ): Promise<DocumentWithCurrent[]> {
    const rows = await this.prisma.document.findMany({
      where: {
        cooperativeId,
        ...(query.onlyPublished && { status: 'publicado' }),
        ...(query.category && { category: query.category }),
        ...(query.search && { title: { contains: query.search, mode: 'insensitive' } }),
      },
      orderBy: [{ documentDate: 'desc' }, { title: 'asc' }],
      select: withCurrentSelect,
    });
    return rows.map(toWithCurrent);
  }

  async find(cooperativeId: string, id: string): Promise<DocumentWithCurrent | null> {
    const row = await this.prisma.document.findFirst({
      where: { id, cooperativeId },
      select: withCurrentSelect,
    });
    return row && toWithCurrent(row);
  }

  async create(
    cooperativeId: string,
    data: { state: DocumentState; version: NewVersion },
  ): Promise<DocumentWithCurrent> {
    const row = await this.prisma.document.create({
      data: {
        cooperativeId,
        ...toData(data.state),
        versions: { create: { ...data.version, isCurrent: true } },
      },
      select: withCurrentSelect,
    });
    return toWithCurrent(row);
  }

  addVersion(
    cooperativeId: string,
    id: string,
    check: (document: DocumentRecord) => void,
    version: NewVersion,
  ): Promise<DocumentWithCurrent | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, cooperativeId, id);
      if (!current) return null;
      check(current);
      // Previous first: the partial unique index allows only one current version.
      await tx.documentVersion.updateMany({
        where: { documentId: id, isCurrent: true },
        data: { isCurrent: false },
      });
      await tx.documentVersion.create({ data: { documentId: id, ...version, isCurrent: true } });
      return toWithCurrent(
        await tx.document.findUniqueOrThrow({ where: { id }, select: withCurrentSelect }),
      );
    });
  }

  update(
    cooperativeId: string,
    id: string,
    decide: (current: DocumentRecord) => DocumentState,
  ): Promise<DocumentRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, cooperativeId, id);
      if (!current) return null;
      return toRecord(
        await tx.document.update({
          where: { id },
          data: toData(decide(current)),
          select: documentSelect,
        }),
      );
    });
  }

  async listVersions(cooperativeId: string, id: string): Promise<VersionRecord[] | null> {
    const document = await this.prisma.document.findFirst({
      where: { id, cooperativeId },
      select: { versions: { orderBy: { uploadedAt: 'desc' }, select: versionSelect } },
    });
    return document?.versions ?? null;
  }

  private async lock(tx: Transaction, cooperativeId: string, id: string) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Document"
      WHERE id = ${id}::uuid AND "cooperativeId" = ${cooperativeId}::uuid
      FOR UPDATE`;
    if (locked.length === 0) return null;
    return toRecord(await tx.document.findUniqueOrThrow({ where: { id }, select: documentSelect }));
  }
}
