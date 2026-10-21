import { type Branding, updateBrandColorBodySchema } from '@multicooperativa/contracts';
import { type RequestHandler, Router } from 'express';
import multer, { MulterError } from 'multer';

import { InvalidRequestError, parseBody } from '../../../../shared/infrastructure/http/validation';
import { getCooperativeContext, requirePermission } from '../../../access';
import * as useCases from '../../application/branding';
import { LogoRejectedError } from '../../application/errors';
import { MAX_LOGO_BYTES } from '../../domain/logo';

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
  // In memory with a hard limit at 1 MB (BR-ACC-17).
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_LOGO_BYTES, files: 1, fields: 0 },
  }).single('file');
  // Translated here, not in the module's error handler: the first module handler in the chain
  // would otherwise claim every multer error as its own.
  const upload: RequestHandler = (req, res, next) =>
    parser(req, res, (error?: unknown) => {
      if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
        next(new LogoRejectedError('too_large'));
        return;
      }
      next(error);
    });

  router.get(base, ...read, async (_req, res) => {
    res.json((await useCases.getBranding(deps, getCooperativeContext(res))) satisfies Branding);
  });

  router.put(`${base}/primary-color`, ...manage, async (req, res) => {
    const { primaryColor } = parseBody(updateBrandColorBodySchema, req.body);
    const branding = await useCases.setPrimaryColor(deps, getCooperativeContext(res), primaryColor);
    res.json(branding satisfies Branding);
  });

  // multipart/form-data: the PNG or JPEG in “file”.
  router.put(`${base}/logo`, ...manage, upload, async (req, res) => {
    if (!req.file) throw new InvalidRequestError();
    const branding = await useCases.setLogo(
      deps,
      getCooperativeContext(res),
      new Uint8Array(req.file.buffer),
    );
    res.json(branding satisfies Branding);
  });

  router.delete(`${base}/logo`, ...manage, async (_req, res) => {
    res.json((await useCases.removeLogo(deps, getCooperativeContext(res))) satisfies Branding);
  });

  return router;
}
