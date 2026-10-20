import type { MeResponse, MyPermissionsResponse } from '@multicooperativa/contracts';
import { type RequestHandler, Router } from 'express';

import type { SessionContext } from '../../application/request-context';
import type { UserSummary } from '../../application/ports/access-context-store';
import { getCooperativeContext, getSessionContext } from './access-middleware';

/** The caller's own data: what the app needs to choose a cooperative and build its navigation. */
export function createMeRouter(deps: {
  getMe(session: SessionContext): Promise<UserSummary>;
  requireSession: RequestHandler;
  requireCooperative: RequestHandler;
}): Router {
  const router = Router();

  router.get('/me', deps.requireSession, async (_req, res) => {
    res.json((await deps.getMe(getSessionContext(res))) satisfies MeResponse);
  });

  // Any active membership may read its own permissions: no module permission required.
  router.get(
    '/cooperatives/:cooperativeId/me/permissions',
    deps.requireCooperative,
    (_req, res) => {
      const context = getCooperativeContext(res);
      res.json({
        cooperativeId: context.cooperativeId,
        profileName: context.profileName,
        isPartner: context.isPartner,
        permissions: context.permissions.map(({ module, level, scope }) => ({
          module,
          level,
          scope,
        })),
      } satisfies MyPermissionsResponse);
    },
  );

  return router;
}
