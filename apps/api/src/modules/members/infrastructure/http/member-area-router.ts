import {
  type CapitalMovement,
  type ListMembersCapitalResponse,
  listMovementsQuerySchema,
  type MemberMovementsResponse,
  type MemberRecord as MemberRecordDto,
  type MyMemberAreaResponse,
  registerCapitalMovementRequestSchema,
  type RegisterCapitalMovementResponse,
} from '@multicooperativa/contracts';
import { type RequestHandler, Router } from 'express';

import { getCooperativeContext, requirePermission } from '../../../access';
import { parseBody } from '../../../../shared/infrastructure/http/validation';
import * as useCases from '../../application/member-area';
import type { MemberAreaDeps } from '../../application/member-area';
import type { MovementRecord } from '../../application/ports/capital-store';
import type { MemberRecord } from '../../application/ports/member-directory';
import { formatMoney } from '../../domain/money';

const toMember = (member: MemberRecord): MemberRecordDto => ({
  membershipId: member.membershipId,
  name: member.name,
  email: member.email,
  partnerNumber: member.partnerNumber,
  isPartner: member.isPartner,
  status: member.status,
  profileName: member.profileName,
  joinedAt: member.joinedAt.toISOString().slice(0, 10),
});

const toMovement = (movement: MovementRecord): CapitalMovement => ({
  id: movement.id,
  date: movement.date,
  type: movement.type,
  concept: movement.concept,
  amount: formatMoney(movement.amountCents),
  recordedAt: movement.recordedAt.toISOString(),
});

const toStatement = (statement: useCases.MemberStatement): MemberMovementsResponse => ({
  member: toMember(statement.member),
  capital: formatMoney(statement.balanceCents),
  movements: statement.movements.map(toMovement),
  nextCursor: statement.nextCursor,
});

/** HTTP adapter of the member area (docs/requirements/06-member-area.md, section 4). */
export function createMemberAreaRouter(
  deps: MemberAreaDeps,
  requireCooperative: RequestHandler,
): Router {
  const router = Router();
  const base = '/cooperatives/:cooperativeId/member-area';
  const read = [requireCooperative, requirePermission('member-area', 'read')];
  const manage = [requireCooperative, requirePermission('member-area', 'manage')];

  router.get(`${base}/me`, ...read, async (_req, res) => {
    const mine = await useCases.getMyRecord(deps, getCooperativeContext(res));
    res.json({
      member: toMember(mine.member),
      capital: formatMoney(mine.balanceCents),
    } satisfies MyMemberAreaResponse);
  });

  router.get(`${base}/me/movements`, ...read, async (req, res) => {
    const q = parseBody(listMovementsQuerySchema, req.query);
    const statement = await useCases.listMyMovements(deps, getCooperativeContext(res), {
      limit: q.limit,
      before: q.before,
    });
    res.json(toStatement(statement));
  });

  router.get(`${base}/members`, ...read, async (_req, res) => {
    const list = await useCases.listMembers(deps, getCooperativeContext(res));
    res.json({
      items: list.items.map((item) => ({
        member: toMember(item.member),
        capital: formatMoney(item.balanceCents),
      })),
      totalCapital: formatMoney(list.totalCents),
    } satisfies ListMembersCapitalResponse);
  });

  router.get(`${base}/members/:membershipId/movements`, ...read, async (req, res) => {
    const q = parseBody(listMovementsQuerySchema, req.query);
    const statement = await useCases.listMemberMovements(
      deps,
      getCooperativeContext(res),
      String(req.params.membershipId),
      { limit: q.limit, before: q.before },
    );
    res.json(toStatement(statement));
  });

  router.post(`${base}/members/:membershipId/movements`, ...manage, async (req, res) => {
    const input = parseBody(registerCapitalMovementRequestSchema, req.body);
    const result = await useCases.registerMovement(
      deps,
      getCooperativeContext(res),
      String(req.params.membershipId),
      input,
    );
    res.status(201).json({
      movement: toMovement(result.movement),
      capital: formatMoney(result.balanceCents),
    } satisfies RegisterCapitalMovementResponse);
  });

  return router;
}
