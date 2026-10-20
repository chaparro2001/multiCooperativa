import {
  listThirdPartiesQuerySchema,
  type ListThirdPartiesResponse,
  type ThirdParty,
  thirdPartyInputSchema,
  thirdPartyUpdateSchema,
} from '@multicooperativa/contracts';
import { type RequestHandler, Router } from 'express';

import { getCooperativeContext, requirePermission } from '../../../access';
import { InvalidRequestError, parseBody } from '../../../../shared/infrastructure/http/validation';
import type { ThirdPartyRecord } from '../../application/ports/third-party-store';
import * as useCases from '../../application/third-parties';

export const toThirdParty = (party: ThirdPartyRecord): ThirdParty => ({
  id: party.id,
  nif: party.nif,
  name: party.name,
  isSupplier: party.isSupplier,
  isCustomer: party.isCustomer,
  email: party.email,
  phone: party.phone,
  active: party.active,
});

/** US-INV-01 (requirements/05, section 8). */
export function createThirdPartiesRouter(
  deps: useCases.ThirdPartyDeps,
  requireCooperative: RequestHandler,
): Router {
  const router = Router();
  const base = '/cooperatives/:cooperativeId/third-parties';
  const read = [requireCooperative, requirePermission('invoicing', 'read')];
  const manage = [requireCooperative, requirePermission('invoicing', 'manage')];

  router.get(base, ...read, async (req, res) => {
    const query = listThirdPartiesQuerySchema.safeParse(req.query);
    if (!query.success) throw new InvalidRequestError();
    const parties = await useCases.listThirdParties(deps, getCooperativeContext(res), {
      role: query.data.type,
      search: query.data.q,
      includeInactive: query.data.inactive,
    });
    res.json({ items: parties.map(toThirdParty) } satisfies ListThirdPartiesResponse);
  });

  router.post(base, ...manage, async (req, res) => {
    const input = parseBody(thirdPartyInputSchema, req.body);
    const party = await useCases.registerThirdParty(deps, getCooperativeContext(res), input);
    res.status(201).json(toThirdParty(party));
  });

  router.patch(`${base}/:thirdPartyId`, ...manage, async (req, res) => {
    const changes = parseBody(thirdPartyUpdateSchema, req.body);
    const party = await useCases.updateThirdParty(
      deps,
      getCooperativeContext(res),
      String(req.params.thirdPartyId),
      changes,
    );
    res.json(toThirdParty(party));
  });

  return router;
}
