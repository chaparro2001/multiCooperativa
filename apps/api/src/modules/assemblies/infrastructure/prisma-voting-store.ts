import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { AssemblyStatus } from '../domain/assembly';
import { AlreadyVotedError, type VoteChoice } from '../domain/errors';
import type { Majority, VotingResult } from '../domain/voting-result';
import type {
  MemberVotingView,
  OpenCheck,
  VotingRecord,
  VotingSnapshot,
  VotingStore,
} from '../application/ports/voting-store';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const votingSelect = {
  id: true,
  pointId: true,
  status: true,
  majority: true,
  firstCallQuorumPercent: true,
  secondCallQuorumPercent: true,
  reinforcedNumerator: true,
  reinforcedDenominator: true,
  secondCallAvailable: true,
  openedAt: true,
  closedAt: true,
  inFavor: true,
  against: true,
  abstentions: true,
  callApplied: true,
  quorumReached: true,
  outcome: true,
  _count: { select: { census: true } },
} as const;

type VotingRow = {
  id: string;
  pointId: string;
  status: 'open' | 'closed';
  majority: Majority;
  firstCallQuorumPercent: number;
  secondCallQuorumPercent: number;
  reinforcedNumerator: number;
  reinforcedDenominator: number;
  secondCallAvailable: boolean;
  openedAt: Date;
  closedAt: Date | null;
  inFavor: number | null;
  against: number | null;
  abstentions: number | null;
  callApplied: 'first' | 'second' | null;
  quorumReached: boolean | null;
  outcome: VotingResult['outcome'] | null;
  _count: { census: number };
};

const isUniqueViolation = (error: unknown) =>
  (error as { code?: unknown } | null)?.code === 'P2002';

/** Votes counted live while open; the stored result once closed. */
async function tallyOf(db: Transaction | PrismaClient, votingId: string) {
  const groups = await db.vote.groupBy({ by: ['choice'], where: { votingId }, _count: true });
  const count = (choice: VoteChoice) => groups.find((g) => g.choice === choice)?._count ?? 0;
  return {
    inFavor: count('in_favor'),
    against: count('against'),
    abstentions: count('abstention'),
  };
}

async function toRecord(db: Transaction | PrismaClient, row: VotingRow): Promise<VotingRecord> {
  const tally =
    row.status === 'closed'
      ? { inFavor: row.inFavor ?? 0, against: row.against ?? 0, abstentions: row.abstentions ?? 0 }
      : await tallyOf(db, row.id);
  const censusSize = row._count.census;
  return {
    id: row.id,
    pointId: row.pointId,
    status: row.status,
    majority: row.majority,
    policy: {
      quorumPercent: { first: row.firstCallQuorumPercent, second: row.secondCallQuorumPercent },
      reinforced: { numerator: row.reinforcedNumerator, denominator: row.reinforcedDenominator },
    },
    secondCallAvailable: row.secondCallAvailable,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    censusSize,
    tally,
    result:
      row.status === 'closed' && row.callApplied && row.outcome
        ? {
            census: censusSize,
            ...tally,
            votesCast: tally.inFavor + tally.against + tally.abstentions,
            quorumReached: Boolean(row.quorumReached),
            call: row.callApplied,
            outcome: row.outcome,
          }
        : null,
  };
}

export class PrismaVotingStore implements VotingStore {
  constructor(private readonly prisma: PrismaClient) {}

  open(
    cooperativeId: string,
    pointId: string,
    census: string[],
    at: Date,
    decide: (check: OpenCheck) => VotingSnapshot,
  ): Promise<VotingRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      // Lock the item: two managers opening at once cannot both pass the check.
      const rows = await tx.$queryRaw<
        {
          votable: boolean;
          majority: Majority | null;
          status: AssemblyStatus;
          secondCallAt: Date | null;
        }[]
      >`
        SELECT p.votable, p.majority, a.status, a."secondCallAt"
        FROM "AssemblyPoint" p JOIN "Assembly" a ON a.id = p."assemblyId"
        WHERE p.id = ${pointId}::uuid AND a."cooperativeId" = ${cooperativeId}::uuid
        FOR UPDATE OF p`;
      const row = rows[0];
      if (!row) return null;
      const existing = await tx.voting.findUnique({ where: { pointId }, select: { status: true } });

      const snapshot = decide({
        assemblyStatus: row.status,
        votable: row.votable,
        majority: row.majority,
        votingStatus: existing?.status ?? 'pending',
        secondCallAvailable: row.secondCallAt !== null,
      });

      const voting = await tx.voting.create({
        data: {
          pointId,
          majority: snapshot.majority,
          firstCallQuorumPercent: snapshot.policy.quorumPercent.first,
          secondCallQuorumPercent: snapshot.policy.quorumPercent.second,
          reinforcedNumerator: snapshot.policy.reinforced.numerator,
          reinforcedDenominator: snapshot.policy.reinforced.denominator,
          secondCallAvailable: snapshot.secondCallAvailable,
          openedAt: at,
        },
        select: { id: true },
      });
      // BR-ASM-02: the census is frozen now; later changes do not alter it.
      await tx.votingCensus.createMany({
        data: census.map((membershipId) => ({ votingId: voting.id, membershipId })),
      });
      return toRecord(
        tx,
        await tx.voting.findUniqueOrThrow({ where: { id: voting.id }, select: votingSelect }),
      );
    });
  }

  close(
    cooperativeId: string,
    pointId: string,
    at: Date,
    decide: (voting: VotingRecord) => VotingResult,
  ): Promise<VotingRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      // FOR UPDATE waits for votes in flight (they hold FOR SHARE) and blocks new ones.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT v.id FROM "Voting" v
        JOIN "AssemblyPoint" p ON p.id = v."pointId"
        JOIN "Assembly" a ON a.id = p."assemblyId"
        WHERE v."pointId" = ${pointId}::uuid AND a."cooperativeId" = ${cooperativeId}::uuid
        FOR UPDATE OF v`;
      const votingId = locked[0]?.id;
      if (!votingId) return null;

      const current = await toRecord(
        tx,
        await tx.voting.findUniqueOrThrow({ where: { id: votingId }, select: votingSelect }),
      );
      const result = decide(current);
      await tx.voting.update({
        where: { id: votingId },
        data: {
          status: 'closed',
          closedAt: at,
          inFavor: result.inFavor,
          against: result.against,
          abstentions: result.abstentions,
          callApplied: result.call,
          quorumReached: result.quorumReached,
          outcome: result.outcome,
        },
      });
      return toRecord(
        tx,
        await tx.voting.findUniqueOrThrow({ where: { id: votingId }, select: votingSelect }),
      );
    });
  }

  async castVote(
    cooperativeId: string,
    pointId: string,
    membershipId: string,
    choice: VoteChoice,
    check: (state: {
      votingStatus: 'pending' | 'open' | 'closed';
      inCensus: boolean;
      previousVote: VoteChoice | null;
    }) => void,
  ): Promise<MemberVotingView | null> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const point = await tx.assemblyPoint.findFirst({
          where: { id: pointId, assembly: { cooperativeId } },
          select: { id: true },
        });
        if (!point) throw new PointNotFound();

        // FOR SHARE: votes run in parallel, but never while the voting is being closed.
        const locked = await tx.$queryRaw<{ id: string; status: 'open' | 'closed' }[]>`
          SELECT id, status FROM "Voting" WHERE "pointId" = ${pointId}::uuid FOR SHARE`;
        const voting = locked[0];
        const [entry, previous] = voting
          ? await Promise.all([
              tx.votingCensus.findUnique({
                where: { votingId_membershipId: { votingId: voting.id, membershipId } },
              }),
              tx.vote.findUnique({
                where: { votingId_membershipId: { votingId: voting.id, membershipId } },
                select: { choice: true },
              }),
            ])
          : [null, null];

        check({
          votingStatus: voting?.status ?? 'pending',
          inCensus: entry !== null,
          previousVote: previous?.choice ?? null,
        });
        // NFR-ASM-01: the unique key and the census foreign key are the last word.
        await tx.vote.create({ data: { votingId: voting!.id, membershipId, choice } });
      });
    } catch (error) {
      if (error instanceof PointNotFound) return null;
      if (isUniqueViolation(error)) {
        // Another request of the same member won the race: show the vote that counts.
        const view = await this.find(cooperativeId, pointId, membershipId);
        throw new AlreadyVotedError(view?.myVote ?? choice);
      }
      throw error;
    }
    return this.find(cooperativeId, pointId, membershipId);
  }

  async find(
    cooperativeId: string,
    pointId: string,
    membershipId: string,
  ): Promise<MemberVotingView | null> {
    const views = await this.findForPoints(cooperativeId, [pointId], membershipId);
    return views.get(pointId) ?? null;
  }

  async findForPoints(
    cooperativeId: string,
    pointIds: string[],
    membershipId: string,
  ): Promise<Map<string, MemberVotingView>> {
    if (pointIds.length === 0) return new Map();
    const rows = await this.prisma.voting.findMany({
      where: { pointId: { in: pointIds }, point: { assembly: { cooperativeId } } },
      select: {
        ...votingSelect,
        census: { where: { membershipId }, select: { membershipId: true } },
        votes: { where: { membershipId }, select: { choice: true } },
      },
    });
    const views = await Promise.all(
      rows.map(async ({ census, votes, ...row }) => ({
        ...(await toRecord(this.prisma, row)),
        inCensus: census.length > 0,
        myVote: votes[0]?.choice ?? null,
      })),
    );
    return new Map(views.map((view) => [view.pointId, view]));
  }
}

class PointNotFound extends Error {}
