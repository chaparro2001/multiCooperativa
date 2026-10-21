import { type CooperativeContext, ModuleAccessDeniedError, requireAccess } from '../../access';
import { balanceOf, createMovement, type NewMovementInput } from '../domain/capital';
import { MemberNotFoundError } from './errors';
import type { CapitalStore, MovementRecord } from './ports/capital-store';
import type { MemberDirectory, MemberRecord } from './ports/member-directory';

export interface MemberAreaDeps {
  capital: CapitalStore;
  members: MemberDirectory;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MemberCapital {
  member: MemberRecord;
  balanceCents: bigint;
}

export interface MemberStatement extends MemberCapital {
  /** Newest first. */
  movements: MovementRecord[];
}

/** Reads need the module; "all" scope also reads other members (ADR-004, requirements/06 section 4). */
function readScope(context: CooperativeContext) {
  return requireAccess(context.permissions, 'member-area', 'read');
}

/** Listing everyone and registering movements are "all" operations: an "own" profile gets 403. */
function requireAllScope(context: CooperativeContext, level: 'read' | 'manage') {
  const scope = requireAccess(context.permissions, 'member-area', level);
  if (scope !== 'all') throw new ModuleAccessDeniedError('member-area', level);
}

async function myMember(deps: MemberAreaDeps, context: CooperativeContext) {
  const member = await deps.members.findMember(context.cooperativeId, context.membershipId);
  if (!member) throw new MemberNotFoundError();
  return member;
}

async function statement(
  deps: MemberAreaDeps,
  cooperativeId: string,
  member: MemberRecord,
): Promise<MemberStatement> {
  const movements = await deps.capital.listMovements(cooperativeId, member.membershipId);
  return { member, balanceCents: balanceOf(movements), movements };
}

/** US-MEM-01, US-MEM-02: my record and capital. */
export async function getMyRecord(
  deps: MemberAreaDeps,
  context: CooperativeContext,
): Promise<MemberCapital> {
  readScope(context);
  const member = await myMember(deps, context);
  const balances = await deps.capital.balances(context.cooperativeId, [member.membershipId]);
  return { member, balanceCents: balances.get(member.membershipId) ?? 0n };
}

/** US-MEM-02: my movements, whatever the scope. */
export async function listMyMovements(
  deps: MemberAreaDeps,
  context: CooperativeContext,
): Promise<MemberStatement> {
  readScope(context);
  return statement(deps, context.cooperativeId, await myMember(deps, context));
}

export interface MemberList {
  items: MemberCapital[];
  /** Share capital of the cooperative: the sum of its members' capital. */
  totalCents: bigint;
}

/** US-MEM-04: every partner with their capital, and the cooperative's total. */
export async function listMembers(
  deps: MemberAreaDeps,
  context: CooperativeContext,
): Promise<MemberList> {
  requireAllScope(context, 'read');
  const partners = await deps.members.listPartners(context.cooperativeId);
  const balances = await deps.capital.balances(
    context.cooperativeId,
    partners.map((partner) => partner.membershipId),
  );
  const items = partners.map((member) => ({
    member,
    balanceCents: balances.get(member.membershipId) ?? 0n,
  }));
  return { items, totalCents: items.reduce((sum, item) => sum + item.balanceCents, 0n) };
}

/**
 * The partner whose record is asked for. With "own" scope only the caller's own
 * record exists: any other id looks like it does not exist (404, not 403).
 */
async function findVisiblePartner(
  deps: MemberAreaDeps,
  context: CooperativeContext,
  scope: 'own' | 'all',
  membershipId: string,
  allowSelf = true,
): Promise<MemberRecord> {
  if (!UUID.test(membershipId)) throw new MemberNotFoundError();
  if (scope === 'own' && membershipId !== context.membershipId) throw new MemberNotFoundError();
  const member = await deps.members.findMember(context.cooperativeId, membershipId);
  const holdsCapital = member && member.isPartner && member.status !== 'removed';
  const isSelf = allowSelf && membershipId === context.membershipId;
  if (!member || (!holdsCapital && !isSelf)) {
    throw new MemberNotFoundError();
  }
  return member;
}

/** US-MEM-02 and US-MEM-04: the movements of a member. */
export async function listMemberMovements(
  deps: MemberAreaDeps,
  context: CooperativeContext,
  membershipId: string,
): Promise<MemberStatement> {
  const scope = readScope(context);
  const member = await findVisiblePartner(deps, context, scope, membershipId);
  return statement(deps, context.cooperativeId, member);
}

/** US-MEM-03: management registers a contribution, refund or correction. */
export async function registerMovement(
  deps: MemberAreaDeps,
  context: CooperativeContext,
  membershipId: string,
  input: NewMovementInput,
): Promise<{ movement: MovementRecord; balanceCents: bigint }> {
  requireAllScope(context, 'manage');
  await findVisiblePartner(deps, context, 'all', membershipId, false);
  return deps.capital.append(context.cooperativeId, membershipId, context.membershipId, (balance) =>
    createMovement(input, balance),
  );
}
