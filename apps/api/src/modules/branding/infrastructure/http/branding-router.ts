import { type Branding, updateBrandColorBodySchema } from '@multicooperativa/contracts';
import { type RequestHandler, Router } from 'express';

import { parseBody } from '../../../../shared/infrastructure/http/validation';
import { getCooperativeContext, requirePermission } from '../../../access';
import * as useCases from '../../application/branding';

/** HTTP adapter of the branding module (requirements/01, US-ACC-14). */
export function createBrandingRouter(
  deps: useCases.BrandingDeps,
  requireCooperative: RequestHandler,
): Router {
  const router = Router();
  const base = '/cooperatives/:cooperativeId/branding';
  // Any member reads; the context already proves the membership.
  const read = [requireCooperative];
  const manage = [requireCooperative, requirePermission('users', 'manage')];
  router.get(base, ...read, async (_req, res) => {
    res.json((await useCases.getBranding(deps, getCooperativeContext(res))) satisfies Branding);
  });

  router.put(`${base}/primary-color`, ...manage, async (req, res) => {
    const { primaryColor } = parseBody(updateBrandColorBodySchema, req.body);
    const branding = await useCases.setPrimaryColor(deps, getCooperativeContext(res), primaryColor);
    res.json(branding satisfies Branding);
  });

  return router;
}
