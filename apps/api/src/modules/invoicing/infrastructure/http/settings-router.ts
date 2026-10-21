import {
  type InvoicingAttention,
  type InvoicingSettings,
  updateInvoicingSettingsBodySchema,
} from '@multicooperativa/contracts';
import { type RequestHandler, Router } from 'express';

import { parseBody } from '../../../../shared/infrastructure/http/validation';
import { getCooperativeContext } from '../../../access';
import * as useCases from '../../application/attention';

/**
 * Notice days and attention counts (BR-INV-15, BR-INV-16). The use cases decide
 * who may: reading needs invoicing access, writing the cooperative's administration.
 */
export function createInvoicingSettingsRouter(
  deps: useCases.AttentionDeps,
  requireCooperative: RequestHandler,
): Router {
  const router = Router();
  const base = '/cooperatives/:cooperativeId/invoicing';

  router.get(`${base}/attention`, requireCooperative, async (_req, res) => {
    const counts = await useCases.attentionCounts(deps, getCooperativeContext(res));
    res.json(counts satisfies InvoicingAttention);
  });

  router.get(`${base}/settings`, requireCooperative, async (_req, res) => {
    const settings = await useCases.getInvoicingSettings(deps, getCooperativeContext(res));
    res.json(settings satisfies InvoicingSettings);
  });

  router.put(`${base}/settings`, requireCooperative, async (req, res) => {
    const body = parseBody(updateInvoicingSettingsBodySchema, req.body);
    const settings = await useCases.updateInvoicingSettings(deps, getCooperativeContext(res), body);
    res.json(settings satisfies InvoicingSettings);
  });

  return router;
}
