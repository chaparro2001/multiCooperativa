import type { AnnouncementsUnread } from '@multicooperativa/contracts';
import { type RequestHandler, Router } from 'express';

import { getCooperativeContext } from '../../../access';
import * as useCases from '../../application/unread';

/** US-ANN-08. Mounted before the main router, whose `/:announcementId` would take "unread-count". */
export function createUnreadRouter(
  deps: useCases.UnreadDeps,
  requireCooperative: RequestHandler,
): Router {
  const router = Router();
  router.get(
    '/cooperatives/:cooperativeId/announcements/unread-count',
    requireCooperative,
    async (_req, res) => {
      res.json(
        (await useCases.countUnreadAnnouncements(
          deps,
          getCooperativeContext(res),
        )) satisfies AnnouncementsUnread,
      );
    },
  );
  return router;
}
