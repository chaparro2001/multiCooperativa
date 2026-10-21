import {
  InsufficientNoticeError,
  InvalidAssemblyError,
  InvalidAssemblyTransitionError,
  VotingAlreadyOpenedError,
} from './errors';
import type { Majority } from './voting-result';

export const ASSEMBLY_TYPES = ['ordinary', 'extraordinary'] as const;
export type AssemblyType = (typeof ASSEMBLY_TYPES)[number];
export type AssemblyStatus = 'draft' | 'convened' | 'held' | 'cancelled';

export const PLACE_MAX_LENGTH = 200;
export const POINT_TITLE_MAX_LENGTH = 200;
export const POINT_DESCRIPTION_MAX_LENGTH = 5000;
export const REASON_MAX_LENGTH = 500;
export const DEFAULT_MIN_NOTICE_DAYS = 15;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface PointInput {
  /** Kept when editing, so its attachments and voting stay with it. */
  id?: string;
  title: string;
  description: string;
  votable: boolean;
  /** Required when votable, absent otherwise (US-ASM-02). */
  majority: Majority | null;
}

export interface PointState extends PointInput {
  /** 1-based position in the agenda. */
  position: number;
}

export interface AssemblyState {
  readonly status: AssemblyStatus;
  readonly type: AssemblyType;
  readonly firstCallAt: Date;
  readonly secondCallAt: Date | null;
  readonly place: string;
  readonly points: readonly PointState[];
}

export interface AssemblyInput {
  type: AssemblyType;
  firstCallAt: Date;
  secondCallAt: Date | null;
  place: string;
  points: PointInput[];
}

function validPoints(points: PointInput[]): PointState[] {
  return points.map((point, i) => {
    const title = point.title.trim();
    const description = point.description.trim();
    const where = `Item ${i + 1}`;
    if (!title)
      throw new InvalidAssemblyError(`${where}: the title is missing.`, `points.${i}.title`);
    if (title.length > POINT_TITLE_MAX_LENGTH) {
      throw new InvalidAssemblyError(
        `${where}: the title exceeds ${POINT_TITLE_MAX_LENGTH} characters.`,
        `points.${i}.title`,
      );
    }
    if (description.length > POINT_DESCRIPTION_MAX_LENGTH) {
      throw new InvalidAssemblyError(
        `${where}: the description is too long.`,
        `points.${i}.description`,
      );
    }
    if (point.votable && !point.majority) {
      throw new InvalidAssemblyError(
        `${where}: a votable item needs a simple or reinforced majority.`,
        `points.${i}.majority`,
      );
    }
    return {
      ...(point.id && { id: point.id }),
      title,
      description,
      votable: point.votable,
      majority: point.votable ? point.majority : null,
      position: i + 1,
    };
  });
}

type Calls = Pick<AssemblyInput, 'firstCallAt' | 'secondCallAt' | 'place'>;

function validCalls(input: Calls): Calls {
  const place = input.place.trim();
  if (!place) throw new InvalidAssemblyError('The place is missing.', 'place');
  if (place.length > PLACE_MAX_LENGTH)
    throw new InvalidAssemblyError('The place is too long.', 'place');
  if (!(input.firstCallAt instanceof Date) || Number.isNaN(input.firstCallAt.getTime())) {
    throw new InvalidAssemblyError('The assembly date is not valid.', 'firstCallAt');
  }
  if (input.secondCallAt && input.secondCallAt.getTime() <= input.firstCallAt.getTime()) {
    throw new InvalidAssemblyError('The second call must be after the first.', 'secondCallAt');
  }
  return { firstCallAt: input.firstCallAt, secondCallAt: input.secondCallAt, place };
}

function validated(input: AssemblyInput): Omit<AssemblyState, 'status'> {
  return { type: input.type, ...validCalls(input), points: validPoints(input.points) };
}

export function createDraft(input: AssemblyInput): AssemblyState {
  return { status: 'draft', ...validated(input) };
}

/** US-ASM-01: points are added, removed and reordered only in draft (BR-ASM-10). */
export function editDraft(assembly: AssemblyState, input: AssemblyInput): AssemblyState {
  if (assembly.status !== 'draft') {
    throw new InvalidAssemblyTransitionError('Only a draft assembly can be edited.');
  }
  return { status: 'draft', ...validated(input) };
}

/** US-ASM-01: future date with the minimum notice and at least one item. */
export function convene<T extends AssemblyState>(assembly: T, now: Date, minNoticeDays: number): T {
  if (assembly.status !== 'draft') {
    throw new InvalidAssemblyTransitionError('Only a draft assembly can be convened.');
  }
  if (assembly.points.length === 0) {
    throw new InvalidAssemblyError('The agenda needs at least one item.', 'points');
  }
  if (assembly.firstCallAt.getTime() - now.getTime() < minNoticeDays * DAY_IN_MS) {
    throw new InsufficientNoticeError(minNoticeDays);
  }
  return { ...assembly, status: 'convened' };
}

/** What an assembly looked like before its last date change (US-ASM-09). */
export interface RescheduledFrom {
  firstCallAt: Date;
  secondCallAt: Date | null;
  place: string;
  at: Date;
  reason: string | null;
}

export interface RescheduleInput {
  firstCallAt: Date;
  secondCallAt: Date | null;
  place: string;
  reason: string | null;
}

/**
 * US-ASM-09: moves a convened assembly (BR-ASM-12). Refused once any voting was
 * opened, open or closed, because its census and votes must not change. The new
 * date keeps the minimum notice counted from now (BR-ASM-09).
 */
export function reschedule<T extends AssemblyState>(
  assembly: T,
  input: RescheduleInput,
  now: Date,
  minNoticeDays: number,
  openedVotings: number,
): T & { rescheduledFrom: RescheduledFrom } {
  if (assembly.status !== 'convened') {
    throw new InvalidAssemblyTransitionError('Only a convened assembly can be rescheduled.');
  }
  if (openedVotings > 0) throw new VotingAlreadyOpenedError();
  const calls = validCalls(input);
  const reason = input.reason?.trim() || null;
  if (reason && reason.length > REASON_MAX_LENGTH) {
    throw new InvalidAssemblyError('The reason is too long.', 'reason');
  }
  if (calls.firstCallAt.getTime() - now.getTime() < minNoticeDays * DAY_IN_MS) {
    throw new InsufficientNoticeError(minNoticeDays, 'firstCallAt');
  }
  return {
    ...assembly,
    ...calls,
    rescheduledFrom: {
      firstCallAt: assembly.firstCallAt,
      secondCallAt: assembly.secondCallAt,
      place: assembly.place,
      at: now,
      reason,
    },
  };
}

export function cancel<T extends AssemblyState>(assembly: T): T {
  if (assembly.status !== 'convened') {
    throw new InvalidAssemblyTransitionError('Only a convened assembly can be cancelled.');
  }
  return { ...assembly, status: 'cancelled' };
}

/** Convened -> Held, once no voting is left open. */
export function close<T extends AssemblyState>(assembly: T, openVotings: number): T {
  if (assembly.status !== 'convened') {
    throw new InvalidAssemblyTransitionError('Only a convened assembly can be closed.');
  }
  if (openVotings > 0) {
    throw new InvalidAssemblyTransitionError('Close the open votings first.');
  }
  return { ...assembly, status: 'held' };
}

/** US-ASM-02: documentation can still be added once convened. */
export function assertCanAttach(status: AssemblyStatus): void {
  if (status !== 'draft' && status !== 'convened') {
    throw new InvalidAssemblyTransitionError(
      'Documentation cannot be added to a held or cancelled assembly.',
    );
  }
}

/** Drafts exist only for "manage". */
export function isVisible(status: AssemblyStatus, canManage: boolean): boolean {
  return canManage || status !== 'draft';
}

/**
 * US-ASM-03: drafts first (only "manage" sees them), then upcoming by date,
 * then the celebrated or cancelled ones, most recent first.
 */
export function orderForListing<T extends { status: AssemblyStatus; firstCallAt: Date }>(
  assemblies: readonly T[],
): T[] {
  const group = (a: T) => (a.status === 'draft' ? 0 : a.status === 'convened' ? 1 : 2);
  return [...assemblies].sort((a, b) => {
    const byGroup = group(a) - group(b);
    if (byGroup !== 0) return byGroup;
    const byDate = a.firstCallAt.getTime() - b.firstCallAt.getTime();
    return group(a) === 2 ? -byDate : byDate;
  });
}
