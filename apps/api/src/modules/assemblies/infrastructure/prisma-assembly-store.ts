import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { AssemblyState, AssemblyStatus, RescheduledFrom } from '../domain/assembly';
import type {
  AssemblyRecord,
  AssemblyStore,
  AssemblySummary,
  AttachmentRecord,
  PointContext,
} from '../application/ports/assembly-store';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const attachmentSelect = { id: true, name: true, fileKey: true, size: true } as const;

const pointSelect = {
  id: true,
  position: true,
  title: true,
  description: true,
  votable: true,
  majority: true,
  attachments: { orderBy: { createdAt: 'asc' }, select: attachmentSelect },
} as const;

const assemblySelect = {
  id: true,
  cooperativeId: true,
  type: true,
  status: true,
  firstCallAt: true,
  secondCallAt: true,
  place: true,
  createdAt: true,
  previousFirstCallAt: true,
  previousSecondCallAt: true,
  previousPlace: true,
  rescheduledAt: true,
  rescheduleReason: true,
  points: { orderBy: { position: 'asc' }, select: pointSelect },
} as const;

const openVotingsOf = (tx: Transaction | PrismaClient, assemblyId: string) =>
  tx.voting.count({ where: { status: 'open', point: { assemblyId } } });

/** A voting row exists only once opened (open or closed). */
const openedVotingsOf = (tx: Transaction | PrismaClient, assemblyId: string) =>
  tx.voting.count({ where: { point: { assemblyId } } });

interface RescheduleColumns {
  previousFirstCallAt: Date | null;
  previousSecondCallAt: Date | null;
  previousPlace: string | null;
  rescheduledAt: Date | null;
  rescheduleReason: string | null;
}

function toRecord(
  row: Omit<AssemblyRecord, 'rescheduledFrom'> & RescheduleColumns,
): AssemblyRecord {
  const {
    previousFirstCallAt,
    previousSecondCallAt,
    previousPlace,
    rescheduledAt,
    rescheduleReason,
    ...rest
  } = row;
  const rescheduledFrom: RescheduledFrom | null =
    rescheduledAt && previousFirstCallAt && previousPlace
      ? {
          firstCallAt: previousFirstCallAt,
          secondCallAt: previousSecondCallAt,
          place: previousPlace,
          at: rescheduledAt,
          reason: rescheduleReason,
        }
      : null;
  return { ...rest, rescheduledFrom };
}

export class PrismaAssemblyStore implements AssemblyStore {
  constructor(private readonly prisma: PrismaClient) {}

  async list(cooperativeId: string, query: { includeDrafts: boolean }): Promise<AssemblySummary[]> {
    const rows = await this.prisma.assembly.findMany({
      where: { cooperativeId, ...(!query.includeDrafts && { status: { not: 'draft' } }) },
      select: {
        id: true,
        type: true,
        status: true,
        firstCallAt: true,
        secondCallAt: true,
        place: true,
        _count: { select: { points: true } },
        points: { select: { voting: { select: { status: true } } } },
      },
    });
    return rows.map(({ _count, points, ...row }) => ({
      ...row,
      pointCount: _count.points,
      openVotings: points.filter((point) => point.voting?.status === 'open').length,
    }));
  }

  async find(cooperativeId: string, id: string): Promise<AssemblyRecord | null> {
    const row = await this.prisma.assembly.findFirst({
      where: { id, cooperativeId },
      select: assemblySelect,
    });
    return row && toRecord(row);
  }

  async create(cooperativeId: string, state: AssemblyState): Promise<AssemblyRecord> {
    const row = await this.prisma.assembly.create({
      data: {
        cooperativeId,
        type: state.type,
        status: state.status,
        firstCallAt: state.firstCallAt,
        secondCallAt: state.secondCallAt,
        place: state.place,
        points: {
          create: state.points.map((point) => ({
            position: point.position,
            title: point.title,
            description: point.description,
            votable: point.votable,
            majority: point.majority,
          })),
        },
      },
      select: assemblySelect,
    });
    return toRecord(row);
  }

  update(
    cooperativeId: string,
    id: string,
    decide: Parameters<AssemblyStore['update']>[2],
  ): Promise<{ assembly: AssemblyRecord; removedFileKeys: string[] } | null> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Assembly"
        WHERE id = ${id}::uuid AND "cooperativeId" = ${cooperativeId}::uuid
        FOR UPDATE`;
      if (locked.length === 0) return null;
      const current = toRecord(
        await tx.assembly.findUniqueOrThrow({ where: { id }, select: assemblySelect }),
      );
      const next = decide(current, await openVotingsOf(tx, id), await openedVotingsOf(tx, id));

      await tx.assembly.update({
        where: { id },
        data: {
          type: next.type,
          status: next.status,
          firstCallAt: next.firstCallAt,
          secondCallAt: next.secondCallAt,
          place: next.place,
          ...(next.rescheduledFrom && {
            previousFirstCallAt: next.rescheduledFrom.firstCallAt,
            previousSecondCallAt: next.rescheduledFrom.secondCallAt,
            previousPlace: next.rescheduledFrom.place,
            rescheduledAt: next.rescheduledFrom.at,
            rescheduleReason: next.rescheduledFrom.reason,
          }),
        },
      });

      // Points only change in a draft; in other transitions `next.points` is the current agenda.
      const keep = new Set(next.points.flatMap((point) => (point.id ? [point.id] : [])));
      const removed = current.points.filter((point) => !keep.has(point.id));
      const removedFileKeys = removed.flatMap((point) => point.attachments.map((a) => a.fileKey));
      if (removed.length > 0) {
        await tx.assemblyPoint.deleteMany({
          where: { id: { in: removed.map((point) => point.id) } },
        });
      }
      const existing = new Set(current.points.map((point) => point.id));
      for (const point of next.points) {
        const data = {
          position: point.position,
          title: point.title,
          description: point.description,
          votable: point.votable,
          majority: point.majority,
        };
        if (point.id && existing.has(point.id)) {
          await tx.assemblyPoint.update({ where: { id: point.id }, data });
        } else {
          // An id that is not this assembly's is ignored: the item is created anew.
          await tx.assemblyPoint.create({ data: { assemblyId: id, ...data } });
        }
      }

      const assembly = toRecord(
        await tx.assembly.findUniqueOrThrow({ where: { id }, select: assemblySelect }),
      );
      return { assembly, removedFileKeys };
    });
  }

  async findPoint(cooperativeId: string, pointId: string): Promise<PointContext | null> {
    const point = await this.prisma.assemblyPoint.findFirst({
      where: { id: pointId, assembly: { cooperativeId } },
      select: {
        ...pointSelect,
        assembly: { select: { id: true, status: true, secondCallAt: true } },
      },
    });
    if (!point) return null;
    const { assembly, ...rest } = point;
    return { point: rest, assembly };
  }

  addAttachment(
    cooperativeId: string,
    pointId: string,
    check: (assemblyStatus: AssemblyStatus) => void,
    attachment: { name: string; fileKey: string; size: number },
  ): Promise<AttachmentRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ status: AssemblyStatus }[]>`
        SELECT a.status FROM "Assembly" a
        JOIN "AssemblyPoint" p ON p."assemblyId" = a.id
        WHERE p.id = ${pointId}::uuid AND a."cooperativeId" = ${cooperativeId}::uuid
        FOR UPDATE OF a`;
      const row = rows[0];
      if (!row) return null;
      check(row.status);
      return tx.pointAttachment.create({
        data: { pointId, ...attachment },
        select: attachmentSelect,
      });
    });
  }
}
