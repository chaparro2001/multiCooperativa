import type { ExtractionResponse } from '@multicooperativa/contracts';
import { type RequestHandler, Router } from 'express';
import multer from 'multer';

import { getCooperativeContext, requirePermission } from '../../../access';
import { MAX_FILE_BYTES } from '../../application/documents';
import { extractDocument, type ExtractionDeps } from '../../application/extraction';
import { InvalidDocumentError } from '../../domain/errors';
import { toThirdParty } from './third-parties-router';

/**
 * US-INV-05: POST /cooperatives/:cooperativeId/extractions (photo or PDF in `file`).
 * Returns a proposal; nothing is stored here (BR-INV-11). The file travels again
 * with the normal registration once a person confirms it.
 */
export function createExtractionsRouter(
  deps: ExtractionDeps,
  requireCooperative: RequestHandler,
): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0 },
  }).single('file');

  router.post(
    '/cooperatives/:cooperativeId/extractions',
    requireCooperative,
    requirePermission('invoicing', 'manage'),
    upload,
    async (req, res) => {
      if (!req.file) throw new InvalidDocumentError('Send a photo (JPEG or PNG) or a PDF.');
      const proposal = await extractDocument(deps, getCooperativeContext(res), {
        content: new Uint8Array(req.file.buffer),
      });
      res.json({
        ...proposal,
        thirdParty: {
          ...proposal.thirdParty,
          match: proposal.thirdParty.match ? toThirdParty(proposal.thirdParty.match) : null,
        },
      } satisfies ExtractionResponse);
    },
  );

  return router;
}
