import { type CooperativeContext, hasAccess, requireAccess } from '../../access';
import type { EventPublisher } from '../../../shared/events';
import { isPdf } from '../../../shared/domain/pdf';
import { type FileStorage, newFileKey } from '../../../shared/files/file-storage';
import {
  type AssemblyInput,
  assertCanAttach,
  cancel,
  close,
  convene,
  createDraft,
  editDraft,
  isVisible,
  orderForListing,
  reschedule,
  type RescheduleInput,
} from '../domain/assembly';
import {
  InvalidAssemblyError,
  InvalidVotingTransitionError,
  type VoteChoice,
} from '../domain/errors';
import {
  assertCanClose,
  assertCanOpen,
  assertCanVote,
  quorumRequired,
  visibleTally,
  type VotingStatus,
} from '../domain/voting';
import { resolveResult, type Tally, type VotingResult } from '../domain/voting-result';
import { AssemblyNotFoundError } from './errors';
import type { AssemblyEvent } from './events';
import type {
  AssemblyRecord,
  AssemblyStore,
  AssemblySummary,
  AttachmentRecord,
  PointContext,
} from './ports/assembly-store';
import type { MemberDirectory } from './ports/member-directory';
import type { AssemblySettingsStore } from './ports/settings-store';
import type { MemberVotingView, VotingStore } from './ports/voting-store';

const PDF = 'application/pdf';
/** Same limit as announcement attachments (BR-ANN-05). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AssemblyDeps {
  assemblies: AssemblyStore;
  votings: VotingStore;
  settings: AssemblySettingsStore;
  members: MemberDirectory;
  files: FileStorage;
  events: EventPublisher<AssemblyEvent>;
  now: () => Date;
}

const canManage = (context: CooperativeContext) =>
  hasAccess(context.permissions, 'assemblies', 'manage');

const requireRead = (context: CooperativeContext) =>
  requireAccess(context.permissions, 'assemblies', 'read');
const requireManage = (context: CooperativeContext) =>
  requireAccess(context.permissions, 'assemblies', 'manage');

async function findVisible(deps: AssemblyDeps, context: CooperativeContext, id: string) {
  const assembly = UUID.test(id) ? await deps.assemblies.find(context.cooperativeId, id) : null;
  if (!assembly || !isVisible(assembly.status, canManage(context)))
    throw new AssemblyNotFoundError();
  return assembly;
}

/** A point of a draft does not exist without "manage". */
async function findVisiblePoint(
  deps: AssemblyDeps,
  context: CooperativeContext,
  pointId: string,
  manager = canManage(context),
): Promise<PointContext> {
  const found = UUID.test(pointId)
    ? await deps.assemblies.findPoint(context.cooperativeId, pointId)
    : null;
  if (!found || !isVisible(found.assembly.status, manager)) throw new AssemblyNotFoundError();
  return found;
}

/** What a member sees of a voting: never how others voted while open (BR-ASM-11). */
export interface VotingView {
  status: VotingStatus;
  censusSize: number | null;
  votesCast: number;
  /** BR-ASM-05: required participation as a fraction 0..1; null when no quorum applies. */
  quorumRequired: number | null;
  tally: Tally | null;
  result: VotingResult | null;
  myVote: VoteChoice | null;
  canVote: boolean;
}

function toView(voting: MemberVotingView | undefined, manager: boolean): VotingView {
  if (!voting) {
    return {
      status: 'pending',
      censusSize: null,
      votesCast: 0,
      quorumRequired: null,
      tally: null,
      result: null,
      myVote: null,
      canVote: false,
    };
  }
  const { inFavor, against, abstentions } = voting.tally;
  return {
    status: voting.status,
    censusSize: voting.censusSize,
    votesCast: inFavor + against + abstentions,
    quorumRequired: quorumRequired({
      policy: voting.policy,
      censusSize: voting.censusSize,
      appliedCall: voting.result?.call ?? null,
    }),
    tally: visibleTally(voting.status, manager, voting.tally),
    result: voting.result,
    myVote: voting.myVote,
    canVote: voting.status === 'open' && voting.inCensus && !voting.myVote,
  };
}

/** US-ASM-03. */
export async function listAssemblies(
  deps: AssemblyDeps,
  context: CooperativeContext,
): Promise<AssemblySummary[]> {
  requireRead(context);
  const assemblies = await deps.assemblies.list(context.cooperativeId, {
    includeDrafts: canManage(context),
  });
  return orderForListing(assemblies);
}

export interface AssemblyDetail extends Omit<AssemblyRecord, 'points'> {
  points: (Omit<AssemblyRecord['points'][number], 'attachments'> & {
    attachments: (Omit<AttachmentRecord, 'fileKey'> & { url: string })[];
    voting: VotingView | null;
  })[];
}

/** US-ASM-03: date, place, type, agenda with documentation and the state of each voting. */
export async function getAssembly(
  deps: AssemblyDeps,
  context: CooperativeContext,
  id: string,
): Promise<AssemblyDetail> {
  requireRead(context);
  const assembly = await findVisible(deps, context, id);
  const manager = canManage(context);
  const votings = await deps.votings.findForPoints(
    context.cooperativeId,
    assembly.points.map((point) => point.id),
    context.membershipId,
  );

  const points = await Promise.all(
    assembly.points.map(async ({ attachments, ...point }) => ({
      ...point,
      attachments: await Promise.all(
        attachments.map(async ({ fileKey, ...attachment }) => ({
          ...attachment,
          url: await deps.files.signedDownloadUrl(fileKey, {
            fileName: attachment.name,
            contentType: PDF,
          }),
        })),
      ),
      voting: point.votable ? toView(votings.get(point.id), manager) : null,
    })),
  );
  return { ...assembly, points };
}

/** US-ASM-01: starts as a draft. */
export async function createAssembly(
  deps: AssemblyDeps,
  context: CooperativeContext,
  input: AssemblyInput,
): Promise<AssemblyRecord> {
  requireManage(context);
  return deps.assemblies.create(context.cooperativeId, createDraft(input));
}

async function updateOrFail(
  deps: AssemblyDeps,
  context: CooperativeContext,
  id: string,
  decide: Parameters<AssemblyStore['update']>[2],
): Promise<AssemblyRecord> {
  const updated = UUID.test(id)
    ? await deps.assemblies.update(context.cooperativeId, id, decide)
    : null;
  if (!updated) throw new AssemblyNotFoundError();
  // Documentation of removed items: its files go too.
  await Promise.all(
    updated.removedFileKeys.map((key) => deps.files.delete(key).catch(() => undefined)),
  );
  return updated.assembly;
}

/** US-ASM-01/02: add, remove and reorder items while in draft. */
export async function updateAssembly(
  deps: AssemblyDeps,
  context: CooperativeContext,
  id: string,
  input: AssemblyInput,
): Promise<AssemblyRecord> {
  requireManage(context);
  return updateOrFail(deps, context, id, (current) => editDraft(current, input));
}

/** US-ASM-01: publishes the call with the cooperative's minimum notice (BR-ASM-09). */
export async function conveneAssembly(
  deps: AssemblyDeps,
  context: CooperativeContext,
  id: string,
): Promise<AssemblyRecord> {
  requireManage(context);
  const now = deps.now();
  const { minNoticeDays } = await deps.settings.get(context.cooperativeId);
  const convened = await updateOrFail(deps, context, id, (current) =>
    convene(current, now, minNoticeDays),
  );
  await deps.events.publish({
    type: 'AssemblyConvened',
    occurredAt: now,
    payload: {
      cooperativeId: context.cooperativeId,
      assemblyId: convened.id,
      firstCallAt: convened.firstCallAt.toISOString(),
    },
  });
  return convened;
}

export interface RescheduleRequest extends RescheduleInput {
  /** Publish an announcement for the members (default true at the API). */
  notifyMembers: boolean;
}

/**
 * US-ASM-09: moves a convened assembly with no voting opened, keeping the
 * minimum notice from now. Emits `AssemblyRescheduled` after saving.
 */
export async function rescheduleAssembly(
  deps: AssemblyDeps,
  context: CooperativeContext,
  id: string,
  { notifyMembers, ...input }: RescheduleRequest,
): Promise<AssemblyRecord> {
  requireManage(context);
  const now = deps.now();
  const { minNoticeDays } = await deps.settings.get(context.cooperativeId);
  const moved = await updateOrFail(deps, context, id, (current, _open, opened) => {
    return reschedule(current, input, now, minNoticeDays, opened);
  });
  // Stored by the update above: what the assembly was before.
  const from = moved.rescheduledFrom!;
  await deps.events.publish({
    type: 'AssemblyRescheduled',
    occurredAt: now,
    payload: {
      cooperativeId: context.cooperativeId,
      assemblyId: moved.id,
      assemblyType: moved.type,
      previous: {
        firstCallAt: from.firstCallAt.toISOString(),
        secondCallAt: from.secondCallAt?.toISOString() ?? null,
        place: from.place,
      },
      firstCallAt: moved.firstCallAt.toISOString(),
      secondCallAt: moved.secondCallAt?.toISOString() ?? null,
      place: moved.place,
      reason: from.reason,
      notifyMembers,
      rescheduledByMembershipId: context.membershipId,
    },
  });
  return moved;
}

export async function cancelAssembly(
  deps: AssemblyDeps,
  context: CooperativeContext,
  id: string,
): Promise<AssemblyRecord> {
  requireManage(context);
  return updateOrFail(deps, context, id, (current) => cancel(current));
}

/** Convened -> held, once every voting is closed. */
export async function closeAssembly(
  deps: AssemblyDeps,
  context: CooperativeContext,
  id: string,
): Promise<AssemblyRecord> {
  requireManage(context);
  return updateOrFail(deps, context, id, (current, openVotings) => close(current, openVotings));
}

/** US-ASM-02: documentation next to the item, PDF of up to 10 MB. */
export async function addPointAttachment(
  deps: AssemblyDeps,
  context: CooperativeContext,
  pointId: string,
  file: { name: string; content: Uint8Array },
): Promise<Omit<AttachmentRecord, 'fileKey'>> {
  requireManage(context);
  const { assembly } = await findVisiblePoint(deps, context, pointId, true);
  assertCanAttach(assembly.status);
  if (!isPdf(file.content)) throw new InvalidAssemblyError('Only PDF documentation is accepted.');
  if (file.content.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new InvalidAssemblyError('Each document can be at most 10 MB.');
  }

  const fileKey = newFileKey(context.cooperativeId, 'assemblies');
  await deps.files.put(fileKey, file.content, PDF);
  try {
    const stored = await deps.assemblies.addAttachment(
      context.cooperativeId,
      pointId,
      assertCanAttach,
      { name: file.name, fileKey, size: file.content.byteLength },
    );
    if (!stored) throw new AssemblyNotFoundError();
    const { fileKey: _key, ...attachment } = stored;
    return attachment;
  } catch (error) {
    await deps.files.delete(fileKey).catch(() => undefined);
    throw error;
  }
}

/** US-ASM-04: freezes the census at this instant (BR-ASM-02) and the rules in force. */
export async function openVoting(
  deps: AssemblyDeps,
  context: CooperativeContext,
  pointId: string,
): Promise<VotingView> {
  requireManage(context);
  const now = deps.now();
  const { point, assembly } = await findVisiblePoint(deps, context, pointId, true);
  const [census, settings] = await Promise.all([
    deps.members.listVoters(context.cooperativeId),
    deps.settings.get(context.cooperativeId),
  ]);

  const opened = await deps.votings.open(context.cooperativeId, pointId, census, now, (check) => {
    assertCanOpen({ ...check, censusSize: census.length });
    return {
      majority: check.majority!,
      policy: settings.policy,
      secondCallAvailable: check.secondCallAvailable,
    };
  });
  if (!opened) throw new AssemblyNotFoundError();

  await deps.events.publish({
    type: 'VotingOpened',
    occurredAt: now,
    payload: {
      cooperativeId: context.cooperativeId,
      assemblyId: assembly.id,
      pointId,
      title: point.title,
    },
  });
  return getVoting(deps, context, pointId);
}

/** US-ASM-04: computes the result (pure, NFR-ASM-02) and admits no more votes. */
export async function closeVoting(
  deps: AssemblyDeps,
  context: CooperativeContext,
  pointId: string,
): Promise<VotingView> {
  requireManage(context);
  const now = deps.now();
  const { point, assembly } = await findVisiblePoint(deps, context, pointId, true);

  const closed = await deps.votings.close(context.cooperativeId, pointId, now, (voting) => {
    assertCanClose(voting.status);
    return resolveResult({
      census: voting.censusSize,
      tally: voting.tally,
      majority: voting.majority,
      policy: voting.policy,
      secondCallAvailable: voting.secondCallAvailable,
    });
  });
  if (!closed) {
    // The item exists (found above): it was never opened.
    throw new InvalidVotingTransitionError('Only an open voting can be closed.');
  }

  await deps.events.publish({
    type: 'VotingClosed',
    occurredAt: now,
    payload: {
      cooperativeId: context.cooperativeId,
      assemblyId: assembly.id,
      pointId,
      title: point.title,
      outcome: closed.result!.outcome,
    },
  });
  return getVoting(deps, context, pointId);
}

/**
 * US-ASM-05. Voting depends on being in the census, not on the profile
 * (BR-ACC-06): no module permission is required, the census decides.
 */
export async function castVote(
  deps: AssemblyDeps,
  context: CooperativeContext,
  pointId: string,
  choice: VoteChoice,
): Promise<VotingView> {
  const view = UUID.test(pointId)
    ? await deps.votings.castVote(
        context.cooperativeId,
        pointId,
        context.membershipId,
        choice,
        assertCanVote,
      )
    : null;
  if (!view) throw new AssemblyNotFoundError();
  return toView(view, canManage(context));
}

/** US-ASM-06: result once closed; only participation while open without "manage". */
export async function getVoting(
  deps: AssemblyDeps,
  context: CooperativeContext,
  pointId: string,
): Promise<VotingView> {
  requireRead(context);
  const { point } = await findVisiblePoint(deps, context, pointId);
  if (!point.votable) throw new AssemblyNotFoundError();
  const voting = await deps.votings.find(context.cooperativeId, pointId, context.membershipId);
  return toView(voting ?? undefined, canManage(context));
}
